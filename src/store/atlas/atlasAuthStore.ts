import { create } from 'zustand';
import { supabase } from '../../lib/supabase';
import { useWatchContinuityStore } from '../../lib/tv/watchContinuityStore';

export interface User {
  id: string;
  email?: string;
  name?: string;
  isAnonymous?: boolean;
  avatarUrl?: string;
}

export interface AtlasAuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  initAuth: () => void;
  updateUserProfile: (patch: { name?: string; avatarUrl?: string | null }) => Promise<void>;
  signOut: () => Promise<void>;
}

let authSubscriptionInitialized = false;
const LOCAL_GUEST_STORAGE_KEY = 'youapp_guest_session_id_v1';
const LOCAL_PROFILE_OVERRIDE_PREFIX = 'youapp_profile_override_v1:';
const USER_SCOPED_LOCAL_KEYS = [
  'youapp_mitv_channels_v1',
  'youapp_youmusic_playlists_v1',
  'youapp_lecturas_v1',
  'youapp_youreels_v1',
  'youapp_saved_moments_v1',
  'youapp_signal_branding_v1',
  'youapp_search_likes_v1',
  'youapp_saved_custom_channels',
  'youapp_followed_community_signals_v1',
  'youapp_last_own_signal_id_v1'
];

function clearUserScopedLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of USER_SCOPED_LOCAL_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore storage errors
  }
}

interface LocalProfileOverride {
  name?: string;
  avatarUrl?: string | null;
}

function readLocalProfileOverride(userId: string): LocalProfileOverride {
  if (!userId || typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_PROFILE_OVERRIDE_PREFIX + userId);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalProfileOverride(userId: string, patch: LocalProfileOverride) {
  if (!userId || typeof window === 'undefined') return;
  try {
    const prev = readLocalProfileOverride(userId);
    const merged: LocalProfileOverride = { ...prev, ...patch };
    localStorage.setItem(LOCAL_PROFILE_OVERRIDE_PREFIX + userId, JSON.stringify(merged));
  } catch {
    // Ignore storage quota errors
  }
}

function isValidAvatarSource(val: unknown): val is string {
  return (
    typeof val === 'string' &&
    (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:image/'))
  );
}

function getOrCreateLocalGuestUser(): User {
  let guestId = 'guest_local_tv';
  try {
    const existing = localStorage.getItem(LOCAL_GUEST_STORAGE_KEY);
    if (existing && existing.startsWith('guest_')) {
      guestId = existing;
    } else {
      guestId = `guest_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(LOCAL_GUEST_STORAGE_KEY, guestId);
    }
  } catch {
    // Ignore storage errors in private mode
  }
  const override = readLocalProfileOverride(guestId);
  return {
    id: guestId,
    name: override.name?.trim() || 'Invitado TV',
    isAnonymous: true,
    avatarUrl: isValidAvatarSource(override.avatarUrl) ? override.avatarUrl : undefined
  };
}

function mapSupabaseSessionUser(rawUser: any): User {
  const email: string | undefined = rawUser?.email || undefined;
  const meta = rawUser?.user_metadata || {};
  const isAnonymous = Boolean(rawUser?.is_anonymous || !email);
  const override = readLocalProfileOverride(rawUser.id);
  const derivedName =
    override.name?.trim() ||
    meta.full_name ||
    meta.name ||
    (email ? email.split('@')[0] : 'Invitado TV');

  let avatarUrl: string | undefined;
  if (override.avatarUrl === null) {
    avatarUrl = undefined;
  } else if (isValidAvatarSource(override.avatarUrl)) {
    avatarUrl = override.avatarUrl;
  } else if (isValidAvatarSource(meta.avatar_url)) {
    avatarUrl = meta.avatar_url;
  }

  return {
    id: rawUser.id,
    email,
    name: derivedName,
    isAnonymous,
    avatarUrl
  };
}

export const useAtlasAuthStore = create<AtlasAuthState>((set, get) => ({
  user: null,
  loading: true,

  setUser: (user) => set({ user }),

  initAuth: () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        set({ user: mapSupabaseSessionUser(session.user), loading: false });
      } else {
        // Invitado local determinístico (<1 ms, 0 filas anónimas huérfanas en Supabase Auth)
        set({ user: getOrCreateLocalGuestUser(), loading: false });
      }
    }).catch(() => {
      set({ user: getOrCreateLocalGuestUser(), loading: false });
    });

    if (!authSubscriptionInitialized) {
      authSubscriptionInitialized = true;
      supabase.auth.onAuthStateChange((_event, session) => {
        const prevUser = get().user;
        if (session?.user) {
          const nextUser = mapSupabaseSessionUser(session.user);
          if (prevUser && (prevUser.isAnonymous || !prevUser.email) && !nextUser.isAnonymous && nextUser.email) {
            // Transición Invitado -> Cuenta Registrada: conservar continuidad
            useWatchContinuityStore.getState().migrateGuestScope(prevUser.id, nextUser.id);
          } else if (
            prevUser &&
            !prevUser.isAnonymous &&
            prevUser.email &&
            !nextUser.isAnonymous &&
            prevUser.id !== nextUser.id
          ) {
            // Cambio directo entre dos cuentas registradas distintas: aislar datos locales
            clearUserScopedLocalStorage();
          }
          set({ user: nextUser, loading: false });
        } else {
          set({ user: getOrCreateLocalGuestUser(), loading: false });
        }
      });
    }
  },

  updateUserProfile: async (patch) => {
    const current = get().user;
    if (!current) return;

    const cleanName = patch.name !== undefined ? (patch.name.trim() || (current.email ? current.email.split('@')[0] : 'Invitado TV')) : current.name;
    const nextAvatar =
      patch.avatarUrl === null
        ? undefined
        : patch.avatarUrl !== undefined
          ? (isValidAvatarSource(patch.avatarUrl) ? patch.avatarUrl : undefined)
          : current.avatarUrl;

    writeLocalProfileOverride(current.id, {
      ...(patch.name !== undefined ? { name: cleanName } : {}),
      ...(patch.avatarUrl !== undefined ? { avatarUrl: nextAvatar ?? null } : {})
    });

    set({
      user: {
        ...current,
        name: cleanName,
        avatarUrl: nextAvatar
      }
    });

    if (!current.isAnonymous && current.email) {
      try {
        await supabase.auth.updateUser({
          data: {
            full_name: cleanName,
            name: cleanName,
            avatar_url: nextAvatar ?? null
          }
        });
      } catch {
        // Local override keeps UI consistent even if metadata update is rate-limited
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await fetch('/api/user/profile', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              display_name: cleanName,
              avatar_url: nextAvatar ?? null
            })
          });
        }
      } catch {
        // Non-blocking profile table sync
      }
    }
  },

  signOut: async () => {
    const prev = get().user;
    await supabase.auth.signOut();
    if (prev && !prev.isAnonymous && prev.email) {
      clearUserScopedLocalStorage();
    }
    set({ user: getOrCreateLocalGuestUser(), loading: false });
  }
}));

// Alias for semantic clarity
export const useAtlasUserStore = useAtlasAuthStore;
