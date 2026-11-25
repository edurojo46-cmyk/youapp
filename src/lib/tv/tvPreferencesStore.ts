import { create } from 'zustand';

export type TvThemeMode = 'system' | 'light' | 'dark';
export type TvPreferredQuality = '1080p' | 'auto' | 'saver';

export interface TvPreferencesState {
  theme: TvThemeMode;
  autoplaySignals: boolean;
  preferredQuality: TvPreferredQuality;
  smartCaptions: boolean;
  setTheme: (theme: TvThemeMode) => void;
  setAutoplaySignals: (enabled: boolean) => void;
  setPreferredQuality: (quality: TvPreferredQuality) => void;
  setSmartCaptions: (enabled: boolean) => void;
}

const STORAGE_KEY = 'youapp_tv_user_preferences_v1';

interface StoredPrefs {
  theme: TvThemeMode;
  autoplaySignals: boolean;
  preferredQuality: TvPreferredQuality;
  smartCaptions: boolean;
}

const DEFAULT_PREFS: StoredPrefs = {
  theme: 'light',
  autoplaySignals: true,
  preferredQuality: '1080p',
  smartCaptions: true
};

function readStoredPrefs(): StoredPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      theme: parsed.theme === 'dark' || parsed.theme === 'system' ? parsed.theme : 'light',
      autoplaySignals: typeof parsed.autoplaySignals === 'boolean' ? parsed.autoplaySignals : true,
      preferredQuality: parsed.preferredQuality === 'auto' || parsed.preferredQuality === 'saver' ? parsed.preferredQuality : '1080p',
      smartCaptions: typeof parsed.smartCaptions === 'boolean' ? parsed.smartCaptions : true
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function applyDocumentTheme(theme: TvThemeMode) {
  if (typeof document === 'undefined') return;
  const resolved =
    theme === 'system'
      ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
  document.documentElement.setAttribute('data-youapp-theme', resolved);
}

function persistPrefs(next: StoredPrefs) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota errors
  }
  applyDocumentTheme(next.theme);
}

const initial = readStoredPrefs();
if (typeof window !== 'undefined') {
  applyDocumentTheme(initial.theme);
}

export const useTvPreferencesStore = create<TvPreferencesState>((set, get) => ({
  ...initial,

  setTheme: (theme) => {
    const next: StoredPrefs = {
      theme,
      autoplaySignals: get().autoplaySignals,
      preferredQuality: get().preferredQuality,
      smartCaptions: get().smartCaptions
    };
    persistPrefs(next);
    set({ theme });
  },

  setAutoplaySignals: (autoplaySignals) => {
    const next: StoredPrefs = {
      theme: get().theme,
      autoplaySignals,
      preferredQuality: get().preferredQuality,
      smartCaptions: get().smartCaptions
    };
    persistPrefs(next);
    set({ autoplaySignals });
  },

  setPreferredQuality: (preferredQuality) => {
    const next: StoredPrefs = {
      theme: get().theme,
      autoplaySignals: get().autoplaySignals,
      preferredQuality,
      smartCaptions: get().smartCaptions
    };
    persistPrefs(next);
    set({ preferredQuality });
  },

  setSmartCaptions: (smartCaptions) => {
    const next: StoredPrefs = {
      theme: get().theme,
      autoplaySignals: get().autoplaySignals,
      preferredQuality: get().preferredQuality,
      smartCaptions
    };
    persistPrefs(next);
    set({ smartCaptions });
  }
}));
