import type { RedVivaOpportunityFactors } from './repeaterAffinityEngine';

const RED_VIVA_STORAGE_KEY = 'youapp_atlas_red_viva_v1';

export interface RedVivaTrialMetrics {
  referralClicks: number;
  playsFromCard: number;
  newFollowers: number;
}

export interface RedVivaTrial {
  id: string;
  hostSignalId: string;
  guestChannelId: string;
  guestChannelName: string;
  guestCategory: string;
  guestOriginUrl: string;
  guestAvatarUrl?: string;
  guestFeaturedVideoTitle?: string;
  isCuratorSignal?: boolean;
  startedAt: string;
  expiresAt: string; // +7 días
  status: 'ACTIVE_7D' | 'PERMANENT' | 'ENDED';
  scorePct: number;
  factors: RedVivaOpportunityFactors;
  reason: string;
  metrics: RedVivaTrialMetrics;
}

export interface RedVivaSettings {
  optedIn: boolean;
  allowedCategories: string[];
  includeCurators: boolean;
}

export interface RedVivaState {
  settings: RedVivaSettings;
  activeTrial: RedVivaTrial | null;
  history: RedVivaTrial[];
}

const DEFAULT_STATE: RedVivaState = {
  settings: {
    optedIn: true,
    allowedCategories: ['Historia', 'Ciencia', 'Fútbol', 'Actualidad'],
    includeCurators: true
  },
  activeTrial: null,
  history: []
};

export function readRedVivaState(): RedVivaState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(RED_VIVA_STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    const state: RedVivaState = {
      settings: {
        optedIn: parsed?.settings?.optedIn !== false,
        allowedCategories: Array.isArray(parsed?.settings?.allowedCategories)
          ? parsed.settings.allowedCategories
          : DEFAULT_STATE.settings.allowedCategories,
        includeCurators: parsed?.settings?.includeCurators !== false
      },
      activeTrial: parsed?.activeTrial || null,
      history: Array.isArray(parsed?.history) ? parsed.history : []
    };
    return state;
  } catch {
    return DEFAULT_STATE;
  }
}

export function writeRedVivaState(state: RedVivaState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RED_VIVA_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function updateRedVivaSettings(patch: Partial<RedVivaSettings>): RedVivaState {
  const cur = readRedVivaState();
  const next: RedVivaState = {
    ...cur,
    settings: { ...cur.settings, ...patch }
  };
  writeRedVivaState(next);
  return next;
}

export function startRedVivaTrial(input: {
  hostSignalId: string;
  guestChannelId: string;
  guestChannelName: string;
  guestCategory: string;
  guestOriginUrl: string;
  guestAvatarUrl?: string;
  guestFeaturedVideoTitle?: string;
  isCuratorSignal?: boolean;
  scorePct: number;
  factors: RedVivaOpportunityFactors;
  reason: string;
}): RedVivaState {
  const cur = readRedVivaState();
  const now = Date.now();
  const trial: RedVivaTrial = {
    id: `rv-${now.toString(36)}`,
    hostSignalId: input.hostSignalId,
    guestChannelId: input.guestChannelId,
    guestChannelName: input.guestChannelName,
    guestCategory: input.guestCategory,
    guestOriginUrl: input.guestOriginUrl,
    guestAvatarUrl: input.guestAvatarUrl,
    guestFeaturedVideoTitle: input.guestFeaturedVideoTitle,
    isCuratorSignal: input.isCuratorSignal,
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'ACTIVE_7D',
    scorePct: input.scorePct,
    factors: input.factors,
    reason: input.reason,
    metrics: {
      referralClicks: 0,
      playsFromCard: 0,
      newFollowers: 0
    }
  };
  const next: RedVivaState = {
    ...cur,
    activeTrial: trial
  };
  writeRedVivaState(next);
  return next;
}

export function recordRedVivaMetric(
  trialId: string,
  metric: keyof RedVivaTrialMetrics
): RedVivaState {
  const cur = readRedVivaState();
  if (!cur.activeTrial || cur.activeTrial.id !== trialId) return cur;
  const next: RedVivaState = {
    ...cur,
    activeTrial: {
      ...cur.activeTrial,
      metrics: {
        ...cur.activeTrial.metrics,
        [metric]: (cur.activeTrial.metrics[metric] || 0) + 1
      }
    }
  };
  writeRedVivaState(next);
  return next;
}

export function decideRedVivaTrial(
  decision: 'PERMANENT' | 'ENDED'
): RedVivaState {
  const cur = readRedVivaState();
  if (!cur.activeTrial) return cur;
  const finalized: RedVivaTrial = {
    ...cur.activeTrial,
    status: decision
  };
  const next: RedVivaState = {
    ...cur,
    activeTrial: null,
    history: [finalized, ...cur.history].slice(0, 30)
  };
  writeRedVivaState(next);
  return next;
}

export function getTrialProgressInfo(trial: RedVivaTrial): {
  dayNumber: number;
  daysLeft: number;
  isComplete: boolean;
} {
  const now = Date.now();
  const start = Date.parse(trial.startedAt) || now;
  const end = Date.parse(trial.expiresAt) || start + 7 * 86400000;
  const elapsedDays = Math.max(0, Math.floor((now - start) / 86400000));
  const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
  return {
    dayNumber: Math.min(7, elapsedDays + 1),
    daysLeft,
    isComplete: now >= end
  };
}
