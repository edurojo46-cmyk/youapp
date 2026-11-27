import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  ArrowLeft,
  Camera,
  Play,
  LogIn,
  LogOut,
  ShieldCheck,
  UserCog,
  KeyRound,
  Link2,
  Smartphone,
  Sun,
  Moon,
  Monitor,
  Sliders,
  Check,
  Trash2,
  RefreshCw,
  Search
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAtlasAuthStore } from '../../store/atlas/atlasAuthStore';
import { useSignalStore } from '../../lib/tv/signalStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import {
  useWatchContinuityStore,
  formatWatchTime,
  type WatchCheckpoint
} from '../../lib/tv/watchContinuityStore';
import {
  useTvPreferencesStore,
  type TvThemeMode,
  type TvPreferredQuality
} from '../../lib/tv/tvPreferencesStore';

export function goYouAppRoute(navigate: (to: string) => void, path: string) {
  const tvOnlyOn5173 =
    path === '/' ||
    path.startsWith('/mitv') ||
    path.startsWith('/programartv') ||
    path.startsWith('/misenal1') ||
    path.startsWith('/repetidoras') ||
    path.startsWith('/asociaciones') ||
    path.startsWith('/search') ||
    path.startsWith('/channels') ||
    path.startsWith('/my-lists') ||
    path.startsWith('/moments') ||
    path.startsWith('/my-algorithm') ||
    path.startsWith('/remote');
  if (typeof window !== 'undefined' && window.location.port === '5175' && tvOnlyOn5173) {
    window.location.assign(`${window.location.protocol}//${window.location.hostname}:5173${path}`);
    return;
  }
  navigate(path);
}

async function compressAvatarFileToDataUrl(file: File): Promise<string> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
      el.src = bitmapUrl;
    });
    const size = 160;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar el recorte circular.');
    const minSide = Math.min(img.width, img.height);
    const sx = Math.max(0, (img.width - minSide) / 2);
    const sy = Math.max(0, (img.height - minSide) / 2);
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.84);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

type MenuPanel = 'main' | 'settings' | 'edit_profile' | 'appearance' | 'playback' | 'security';

interface TvUserSessionMenuProps {
  compact?: boolean;
  variant?: 'light' | 'glass';
}

export function TvUserSessionMenu({ compact = false, variant = 'light' }: TvUserSessionMenuProps) {
  const isGlass = variant === 'glass';
  const navigate = useNavigate();
  const location = useLocation();
  const { user, updateUserProfile, signOut } = useAtlasAuthStore();
  const { activeSignal, jumpTo } = useSignalStore();

  const entriesByScope = useWatchContinuityStore((s) => s.entriesByScope);
  const getLatestForUser = useWatchContinuityStore((s) => s.getLatestForUser);
  const clearScope = useWatchContinuityStore((s) => s.clearScope);
  const requestResume = useWatchContinuityStore((s) => s.requestResume);

  const {
    theme,
    autoplaySignals,
    preferredQuality,
    smartCaptions,
    setTheme,
    setAutoplaySignals,
    setPreferredQuality,
    setSmartCaptions
  } = useTvPreferencesStore();

  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<MenuPanel>('main');
  const [nameDraft, setNameDraft] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [connectedSocialCount, setConnectedSocialCount] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGuest = !user || Boolean(user.isAnonymous || !user.email);
  const displayName = isGuest
    ? (user?.name && user.name !== 'Invitado TV' ? user.name : 'Invitado TV')
    : (user?.name || user?.email?.split('@')[0] || 'Mi Cuenta');
  const handleText = isGuest
    ? '@invitado'
    : `@${(user?.email?.split('@')[0] || displayName).toLowerCase().replace(/[^a-z0-9._-]/g, '')}`;

  const initials = isGuest && displayName === 'Invitado TV'
    ? 'TV'
    : displayName
        .split(/[\s._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || 'U';

  void entriesByScope;
  const recentCheckpoints = getLatestForUser(user?.id, 3);

  useEffect(() => {
    setNameDraft(displayName);
  }, [displayName, open]);

  useEffect(() => {
    if (!open) {
      setPanel('main');
      setFeedbackMsg(null);
      return;
    }
    const handleOutside = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        if (panel !== 'main') setPanel('main');
        else setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, panel]);

  // Fetch connected social networks badge count when menu opens for signed-in users
  useEffect(() => {
    if (!open || isGuest) {
      setConnectedSocialCount(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const r = await fetch('/api/user/social/publisher/accounts', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!r.ok) return;
        const json = await r.json();
        if (alive && Array.isArray(json?.accounts)) {
          const count = json.accounts.filter((a: any) => a.ready && !a.protected).length;
          setConnectedSocialCount(count);
        }
      } catch {
        // Optional badge only
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, isGuest]);

  const showNotice = (ok: boolean, text: string) => {
    setFeedbackMsg({ ok, text });
    window.setTimeout(() => {
      setFeedbackMsg((cur) => (cur?.text === text ? null : cur));
    }, 3200);
  };

  const handleAvatarFileSelected = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showNotice(false, 'Elegí una imagen JPG, PNG o WebP.');
      return;
    }
    try {
      setSavingProfile(true);
      const dataUrl = await compressAvatarFileToDataUrl(file);
      await updateUserProfile({ avatarUrl: dataUrl });
      showNotice(true, '✓ Foto de perfil actualizada en todas tus pantallas.');
    } catch (err: any) {
      showNotice(false, err?.message || 'No se pudo actualizar la foto.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveProfileName = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!nameDraft.trim()) return;
    try {
      setSavingProfile(true);
      await updateUserProfile({ name: nameDraft.trim() });
      showNotice(true, '✓ Perfil guardado correctamente.');
      setPanel('main');
    } catch {
      showNotice(false, 'No se pudo guardar el nombre.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (newPassword.length < 6) {
      showNotice(false, 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showNotice(false, 'Las contraseñas no coinciden.');
      return;
    }
    try {
      setSavingPassword(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      showNotice(true, '✓ Contraseña actualizada con éxito.');
      setPanel('main');
    } catch (err: any) {
      showNotice(false, err?.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleResumeCheckpoint = (cp: WatchCheckpoint) => {
    setOpen(false);
    requestResume(cp.blockId, cp.positionSec);

    if (activeSignal && activeSignal.schedule.some((b) => b.id === cp.blockId)) {
      jumpTo(cp.blockId);
    }

    const currentPath = location.pathname;
    const targetRoute = cp.route || '/mitv';

    if (currentPath !== targetRoute) {
      goYouAppRoute(navigate, targetRoute);
      setTimeout(() => {
        const api = usePlayerStore.getState().playerApi;
        if (api) {
          void api.seek(cp.positionSec);
          void api.play();
        }
      }, 650);
    } else {
      setTimeout(() => {
        const api = usePlayerStore.getState().playerApi;
        if (api) {
          void api.seek(cp.positionSec);
          void api.play();
        }
      }, 220);
    }
  };

  const returnToUrl = `/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`;

  const themeLabel =
    theme === 'dark' ? 'Oscuro' : theme === 'system' ? 'Automático' : 'Claro';
  const qualityLabel =
    preferredQuality === '1080p' ? 'Full HD 1080p' : preferredQuality === 'saver' ? 'Ahorro' : 'Auto';

  const renderAvatarCircle = (sizePx: number, withCameraOverlay = false) => (
    <div style={{ position: 'relative', width: sizePx, height: sizePx, flexShrink: 0 }}>
      {user?.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={displayName}
          style={{
            width: sizePx,
            height: sizePx,
            borderRadius: '50%',
            objectFit: 'cover',
            border: '2px solid #e2e8f0'
          }}
        />
      ) : (
        <div
          style={{
            width: sizePx,
            height: sizePx,
            borderRadius: '50%',
            background: isGuest
              ? 'linear-gradient(135deg, #475569 0%, #1e293b 100%)'
              : 'linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)',
            color: '#ffffff',
            fontSize: Math.round(sizePx * 0.36),
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            letterSpacing: '0.4px'
          }}
        >
          {initials}
        </div>
      )}

      {withCameraOverlay && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          title="Subir o cambiar foto de perfil"
          aria-label="Subir o cambiar foto de perfil"
          style={{
            position: 'absolute',
            right: -3,
            bottom: -3,
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#ffffff',
            color: '#0f172a',
            border: '1px solid #cbd5e1',
            boxShadow: '0 2px 6px rgba(15,23,42,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0
          }}
        >
          <Camera size={13} />
        </button>
      )}
    </div>
  );

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', position: 'relative', zIndex: 90 }}>
      <button
        type="button"
        onClick={() => goYouAppRoute(navigate, '/search')}
        title="Buscar en YOUAPP"
        aria-label="Buscar en YOUAPP"
        style={{
          width: 34,
          height: 34,
          borderRadius: '999px',
          border:
            variant === 'light'
              ? '1px solid rgba(15, 23, 42, 0.14)'
              : '1px solid rgba(255, 255, 255, 0.2)',
          background:
            variant === 'light'
              ? 'rgba(15, 23, 42, 0.06)'
              : 'rgba(255, 255, 255, 0.1)',
          color: variant === 'light' ? '#0f172a' : '#f5f5f7',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0
        }}
      >
        <Search size={16} strokeWidth={2.2} />
      </button>
      <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarFileSelected}
        style={{ display: 'none' }}
      />

      {/* TOP-RIGHT AVATAR TRIGGER BUTTON (MINIMALIST PURE CIRCLE) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={isGuest ? 'Perfil (Invitado)' : `Perfil de ${displayName}`}
        title={isGuest ? 'Perfil y Configuración (Invitado)' : `${displayName} · ${user?.email}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2px',
          borderRadius: '50%',
          border: isGlass
            ? open
              ? '1.5px solid rgba(100, 210, 255, 0.85)'
              : '1.5px solid rgba(255, 255, 255, 0.28)'
            : open
              ? '1.5px solid #2563eb'
              : '1.5px solid var(--you-border, #e2e8f0)',
          background: isGlass ? 'rgba(255, 255, 255, 0.1)' : '#ffffff',
          backdropFilter: isGlass ? 'blur(18px) saturate(160%)' : undefined,
          WebkitBackdropFilter: isGlass ? 'blur(18px) saturate(160%)' : undefined,
          cursor: 'pointer',
          boxShadow: isGlass
            ? open
              ? '0 0 0 3px rgba(100, 210, 255, 0.22), 0 6px 18px rgba(0, 0, 0, 0.28)'
              : '0 4px 14px rgba(0, 0, 0, 0.22)'
            : open
              ? '0 0 0 3px rgba(37, 99, 235, 0.16)'
              : '0 2px 8px rgba(15, 23, 42, 0.08)',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease'
        }}
      >
        {renderAvatarCircle(compact ? 30 : 34, false)}
      </button>

      {/* GOOGLE ACCOUNT / YOUTUBE STUDIO STYLE POPOVER */}
      {open && (
        <div
          role="menu"
          aria-label="Menú de Perfil y Configuración"
          className={isGlass ? 'tv-user-glass-popover' : undefined}
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 10px)',
            width: 312,
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: 'calc(100dvh - 88px)',
            overflowY: 'auto',
            background: isGlass ? 'rgba(18, 20, 26, 0.92)' : '#ffffff',
            backdropFilter: isGlass ? 'blur(28px) saturate(185%)' : undefined,
            WebkitBackdropFilter: isGlass ? 'blur(28px) saturate(185%)' : undefined,
            border: isGlass ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid #e2e8f0',
            borderRadius: 18,
            boxShadow: isGlass
              ? '0 24px 54px rgba(0, 0, 0, 0.56), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
              : '0 22px 48px rgba(15, 23, 42, 0.18)',
            padding: '12px',
            color: isGlass ? '#f5f5f7' : '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif'
          }}
        >
          {isGlass && (
            <style>{`
              .tv-user-glass-popover div,
              .tv-user-glass-popover form,
              .tv-user-glass-popover label {
                border-color: rgba(255, 255, 255, 0.14) !important;
              }
              .tv-user-glass-popover > div:first-of-type {
                background: rgba(255, 255, 255, 0.08) !important;
              }
              .tv-user-glass-popover span,
              .tv-user-glass-popover strong,
              .tv-user-glass-popover label,
              .tv-user-glass-popover p {
                color: #f5f5f7 !important;
              }
              .tv-user-glass-popover button {
                color: #f5f5f7 !important;
              }
              .tv-user-glass-popover button[style*="background: rgb(255, 255, 255)"],
              .tv-user-glass-popover button[style*="background: #ffffff"],
              .tv-user-glass-popover button[style*="background: #f8fafc"],
              .tv-user-glass-popover button[style*="background: rgb(248, 250, 252)"],
              .tv-user-glass-popover button[style*="background: #f1f5f9"],
              .tv-user-glass-popover button[style*="background: rgb(241, 245, 249)"],
              .tv-user-glass-popover button[style*="background: #eff6ff"],
              .tv-user-glass-popover button[style*="background: rgb(239, 246, 255)"] {
                background: rgba(255, 255, 255, 0.12) !important;
                border-color: rgba(255, 255, 255, 0.2) !important;
              }
              .tv-user-glass-popover button:hover {
                background: rgba(255, 255, 255, 0.16) !important;
              }
              .tv-user-glass-popover button[style*="background: #2563eb"],
              .tv-user-glass-popover button[style*="background: rgb(37, 99, 235)"] {
                background: #0071e3 !important;
                color: #ffffff !important;
              }
              .tv-user-glass-popover button[style*="background: #2563eb"]:hover,
              .tv-user-glass-popover button[style*="background: rgb(37, 99, 235)"]:hover {
                background: #0a84ff !important;
              }
              .tv-user-glass-popover div[style*="background: linear-gradient"],
              .tv-user-glass-popover div[style*="background: #f8fafc"],
              .tv-user-glass-popover div[style*="background: rgb(248, 250, 252)"],
              .tv-user-glass-popover div[style*="background: #f1f5f9"],
              .tv-user-glass-popover div[style*="background: rgb(241, 245, 249)"],
              .tv-user-glass-popover div[style*="background: #fffbeb"],
              .tv-user-glass-popover div[style*="background: rgb(255, 251, 235)"] {
                background: rgba(255, 255, 255, 0.08) !important;
              }
              .tv-user-glass-popover input {
                background: rgba(255, 255, 255, 0.12) !important;
                border: 1px solid rgba(255, 255, 255, 0.24) !important;
                color: #ffffff !important;
              }
              .tv-user-glass-popover input::placeholder {
                color: rgba(245, 245, 247, 0.55) !important;
              }
              .tv-user-glass-popover svg {
                color: #64d2ff;
              }
            `}</style>
          )}
          {feedbackMsg && (
            <div
              role="status"
              style={{
                padding: '8px 11px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                background: feedbackMsg.ok ? '#ecfdf5' : '#fef2f2',
                color: feedbackMsg.ok ? '#065f46' : '#b91c1c',
                border: feedbackMsg.ok ? '1px solid #a7f3d0' : '1px solid #fecaca'
              }}
            >
              {feedbackMsg.text}
            </div>
          )}

          {/* ==================== SUB-PANEL: EDITAR PERFIL Y FOTO ==================== */}
          {panel === 'edit_profile' && (
            <form onSubmit={handleSaveProfileName} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SubPanelHeader title="Foto y Perfil" onBack={() => setPanel('main')} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 4px' }}>
                {renderAvatarCircle(62, true)}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    type="button"
                    disabled={savingProfile}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid #bfdbfe',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Subir nueva foto
                  </button>
                  {user?.avatarUrl && (
                    <button
                      type="button"
                      disabled={savingProfile}
                      onClick={() => void updateUserProfile({ avatarUrl: null })}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        color: '#64748b',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Quitar foto actual
                    </button>
                  )}
                </div>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 700, color: '#334155' }}>
                Nombre visible en YOUAPP
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={50}
                  placeholder="Tu nombre o el de tu canal"
                  style={{
                    padding: '9px 11px',
                    borderRadius: 10,
                    border: '1px solid #cbd5e1',
                    fontSize: 13.5,
                    color: '#0f172a',
                    background: '#f8fafc'
                  }}
                />
              </label>

              {!isGuest && (
                <div style={{ fontSize: 11.5, color: '#64748b' }}>
                  Correo verificado: <strong>{user?.email}</strong>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="submit"
                  disabled={savingProfile}
                  style={{
                    flex: 1,
                    padding: '9px 14px',
                    borderRadius: 10,
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {savingProfile ? 'Guardando…' : 'Guardar cambios'}
                </button>
                {!isGuest && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate('/perfil');
                    }}
                    style={{
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#334155',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Ficha completa
                  </button>
                )}
              </div>
            </form>
          )}

          {/* ==================== SUB-PANEL: APARIENCIA ==================== */}
          {panel === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <SubPanelHeader title="Apariencia" onBack={() => setPanel('settings')} />
              <div style={{ fontSize: 11.5, color: '#64748b', padding: '0 4px 4px' }}>
                La preferencia se aplica al instante en este navegador.
              </div>
              {([
                { id: 'light', label: 'Tema claro', icon: <Sun size={15} /> },
                { id: 'dark', label: 'Tema oscuro', icon: <Moon size={15} /> },
                { id: 'system', label: 'Usar tema del dispositivo', icon: <Monitor size={15} /> }
              ] as { id: TvThemeMode; label: string; icon: React.ReactNode }[]).map((opt) => {
                const active = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setTheme(opt.id);
                      showNotice(true, `✓ Apariencia: ${opt.label}`);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '9px 11px',
                      borderRadius: 10,
                      border: active ? '1px solid #bfdbfe' : '1px solid transparent',
                      background: active ? '#eff6ff' : 'transparent',
                      color: active ? '#1d4ed8' : '#1e293b',
                      fontSize: 13,
                      fontWeight: active ? 700 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                      {opt.icon}
                      {opt.label}
                    </span>
                    {active && <Check size={15} color="#2563eb" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* ==================== SUB-PANEL: REPRODUCCIÓN Y CALIDAD ==================== */}
          {panel === 'playback' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SubPanelHeader title="Reproducción y Calidad" onBack={() => setPanel('settings')} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px' }}>
                  Calidad de video preferida
                </span>
                {([
                  { id: '1080p', label: 'Full HD 1080p (Máxima nitidez)' },
                  { id: 'auto', label: 'Automática según conexión' },
                  { id: 'saver', label: 'Ahorro de datos (móvil)' }
                ] as { id: TvPreferredQuality; label: string }[]).map((q) => {
                  const active = preferredQuality === q.id;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setPreferredQuality(q.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 9,
                        border: active ? '1px solid #bfdbfe' : '1px solid transparent',
                        background: active ? '#eff6ff' : 'transparent',
                        color: active ? '#1d4ed8' : '#1e293b',
                        fontSize: 12.5,
                        fontWeight: active ? 700 : 500,
                        cursor: 'pointer'
                      }}
                    >
                      <span>{q.label}</span>
                      {active && <Check size={15} color="#2563eb" />}
                    </button>
                  );
                })}
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ToggleRow
                  label="Autoplay al cambiar de señal"
                  sub="Inicia automáticamente la transmisión elegida"
                  checked={autoplaySignals}
                  onChange={setAutoplaySignals}
                />
                <ToggleRow
                  label="Subtítulos y zócalos inteligentes"
                  sub="Mostrar contexto editorial cuando esté disponible"
                  checked={smartCaptions}
                  onChange={setSmartCaptions}
                />
              </div>
            </div>
          )}

          {/* ==================== SUB-PANEL: CONTRASEÑA Y SEGURIDAD ==================== */}
          {panel === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SubPanelHeader title="Contraseña y Seguridad" onBack={() => setPanel('settings')} />
              {isGuest ? (
                <div style={{ padding: '10px 12px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12, color: '#92400e', lineHeight: 1.45 }}>
                  Estás navegando en Modo Invitado. Iniciá sesión o creá tu cuenta para configurar una contraseña personal.
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate(returnToUrl);
                    }}
                    style={{
                      marginTop: 8,
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 9,
                      border: 'none',
                      background: '#2563eb',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    Iniciar sesión / Crear cuenta
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSavePassword} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#334155' }}>
                    Nueva contraseña
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      style={{ padding: '8px 10px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13 }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#334155' }}>
                    Confirmar nueva contraseña
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repetí la contraseña"
                      required
                      style={{ padding: '8px 10px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13 }}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={savingPassword}
                    style={{
                      marginTop: 4,
                      padding: '9px 14px',
                      borderRadius: 9,
                      border: 'none',
                      background: '#2563eb',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: 12.5,
                      cursor: 'pointer'
                    }}
                  >
                    {savingPassword ? 'Actualizando…' : 'Actualizar contraseña'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ==================== SUB-PANEL: CONFIGURACIÓN ==================== */}
          {panel === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <SubPanelHeader title="Configuración" onBack={() => setPanel('main')} />
              <MenuRow
                icon={theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
                label="Apariencia"
                rightText={themeLabel}
                hasSubmenu
                onClick={() => setPanel('appearance')}
              />
              <MenuRow
                icon={<Sliders size={15} />}
                label="Reproducción y calidad"
                rightText={qualityLabel}
                hasSubmenu
                onClick={() => setPanel('playback')}
              />
              <MenuRow
                icon={<Smartphone size={15} />}
                label="Control remoto TV"
                onClick={() => {
                  setOpen(false);
                  goYouAppRoute(navigate, '/remote');
                }}
              />
              <MenuRow
                icon={<KeyRound size={15} />}
                label="Contraseña y seguridad"
                hasSubmenu
                onClick={() => setPanel('security')}
              />
              {!isGuest && (
                <MenuRow
                  icon={<RefreshCw size={15} />}
                  label="Cambiar de cuenta"
                  onClick={() => {
                    setOpen(false);
                    navigate(returnToUrl);
                  }}
                />
              )}
            </div>
          )}

          {/* ==================== PANEL PRINCIPAL (MINIMALISTA PROFESIONAL) ==================== */}
          {panel === 'main' && (
            <>
              {/* 1. CABECERA LIMPIA */}
              <div
                style={{
                  padding: '10px',
                  borderRadius: 13,
                  background: isGlass ? 'rgba(255, 255, 255, 0.06)' : '#f8fafc',
                  border: isGlass ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  {renderAvatarCircle(44, true)}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 750,
                        color: isGlass ? '#ffffff' : '#0f172a',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {displayName}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: isGlass ? 'rgba(245, 245, 247, 0.65)' : '#64748b',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {isGuest ? `${handleText} · Invitado` : user?.email}
                    </div>
                  </div>
                  {!isGuest && (
                    <button
                      type="button"
                      onClick={() => setPanel('edit_profile')}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 999,
                        border: isGlass ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid #cbd5e1',
                        background: isGlass ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
                        color: isGlass ? '#f5f5f7' : '#1e293b',
                        fontSize: 11.5,
                        fontWeight: 650,
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                    >
                      Editar
                    </button>
                  )}
                </div>

                {isGuest && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      const target = returnToUrl;
                      setOpen(false);
                      navigate(target);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: 'none',
                      background: '#0071e3',
                      color: '#ffffff',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <LogIn size={14} /> Iniciar sesión
                  </button>
                )}
              </div>

              {/* 2. SEGUIR VIENDO (SOLO SI HAY PROGRESO ACTIVO, MÁX. 2) */}
              {recentCheckpoints.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
                    <span style={{ fontSize: 10, fontWeight: 750, letterSpacing: '0.09em', color: '#94a3b8', textTransform: 'uppercase' }}>
                      Seguir viendo
                    </span>
                    <button
                      type="button"
                      onClick={() => clearScope(user?.id)}
                      title="Limpiar lista de Seguir viendo"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        border: 'none',
                        background: 'none',
                        color: '#94a3b8',
                        fontSize: 10.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      <Trash2 size={11} /> Limpiar
                    </button>
                  </div>
                  {recentCheckpoints.slice(0, 2).map((cp) => {
                    const pct =
                      cp.durationSec > 0
                        ? Math.min(95, Math.max(5, Math.round((cp.positionSec / cp.durationSec) * 100)))
                        : 25;
                    return (
                      <button
                        key={cp.key}
                        type="button"
                        onClick={() => handleResumeCheckpoint(cp)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          width: '100%',
                          textAlign: 'left',
                          padding: '7px 10px',
                          borderRadius: 10,
                          border: isGlass ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #e2e8f0',
                          background: isGlass ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 650, color: isGlass ? '#ffffff' : '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cp.topic || cp.blockTitle}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: '#38bdf8', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                            <Play size={10} fill="currentColor" /> {formatWatchTime(cp.positionSec)}
                          </span>
                        </div>
                        <div style={{ width: '100%', height: 3, borderRadius: 999, background: isGlass ? 'rgba(255, 255, 255, 0.16)' : '#cbd5e1', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #0071e3, #38bdf8)' }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 3. ACCESOS PRINCIPALES (4 FILAS LIMPIAS) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, borderTop: isGlass ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #f1f5f9', paddingTop: 6 }}>
                <MenuRow
                  icon={<UserCog size={15} />}
                  label="Mi Perfil"
                  onClick={() => {
                    setOpen(false);
                    goYouAppRoute(navigate, '/perfil');
                  }}
                />
                <MenuRow
                  icon={<ShieldCheck size={15} />}
                  label="Mi Algoritmo"
                  onClick={() => {
                    setOpen(false);
                    goYouAppRoute(navigate, '/my-algorithm');
                  }}
                />
                <MenuRow
                  icon={<Link2 size={15} />}
                  label="Redes conectadas"
                  badge={connectedSocialCount && connectedSocialCount > 0 ? String(connectedSocialCount) : undefined}
                  onClick={() => {
                    setOpen(false);
                    goYouAppRoute(navigate, '/redes');
                  }}
                />
                <MenuRow
                  icon={<Sliders size={15} />}
                  label="Configuración"
                  hasSubmenu
                  onClick={() => setPanel('settings')}
                />
              </div>

              {/* 4. CERRAR SESIÓN */}
              {!isGuest && (
                <div style={{ borderTop: isGlass ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #f1f5f9', paddingTop: 6 }}>
                  <button
                    type="button"
                    onClick={async () => {
                      setOpen(false);
                      await signOut();
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: 'none',
                      background: 'transparent',
                      color: isGlass ? '#ff9a94' : '#b91c1c',
                      fontSize: 12.5,
                      fontWeight: 650,
                      cursor: 'pointer'
                    }}
                  >
                    <LogOut size={15} /> Cerrar sesión
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function SubPanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Volver al menú principal"
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '1px solid #e2e8f0',
          background: '#f8fafc',
          color: '#334155',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0
        }}
      >
        <ArrowLeft size={14} />
      </button>
      <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{title}</span>
    </div>
  );
}

function MenuRow({
  icon,
  label,
  rightText,
  badge,
  hasSubmenu = false,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  rightText?: string;
  badge?: string;
  hasSubmenu?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        width: '100%',
        padding: '8px 9px',
        borderRadius: 9,
        border: 'none',
        background: 'transparent',
        color: '#1e293b',
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
        textAlign: 'left'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#f8fafc';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <span style={{ color: '#64748b', display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </span>

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        {badge && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: '1px 7px',
              borderRadius: 999,
              background: '#f1f5f9',
              color: '#334155'
            }}
          >
            {badge}
          </span>
        )}
        {rightText && <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{rightText}</span>}
        {hasSubmenu && <ChevronRight size={14} color="#94a3b8" />}
      </span>
    </button>
  );
}

function ToggleRow({
  label,
  sub,
  checked,
  onChange
}: {
  label: string;
  sub: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        width: '100%',
        padding: '8px 10px',
        borderRadius: 10,
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        cursor: 'pointer',
        textAlign: 'left'
      }}
    >
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>{label}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{sub}</div>
      </div>
      <div
        style={{
          width: 36,
          height: 20,
          borderRadius: 999,
          background: checked ? '#2563eb' : '#cbd5e1',
          padding: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: checked ? 'flex-end' : 'flex-start',
          transition: 'background 0.15s ease',
          flexShrink: 0
        }}
      >
        <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </div>
    </button>
  );
}
