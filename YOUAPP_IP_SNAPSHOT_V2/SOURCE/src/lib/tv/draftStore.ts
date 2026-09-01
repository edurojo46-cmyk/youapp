import type { CustomSignal } from './signalTypes';

// For V1, we store drafted signals in memory and optionally in localStorage
// so they survive a refresh if needed.

const DRAFT_KEY = 'youapp_draft_signals';

function getDrafts(): Record<string, CustomSignal> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDrafts(drafts: Record<string, CustomSignal>) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  } catch {
    // Ignore quota errors
  }
}

export function saveDraftSignal(signal: CustomSignal): void {
  const drafts = getDrafts();
  drafts[signal.id] = signal;
  saveDrafts(drafts);
}

export function getDraftSignal(id: string): CustomSignal | null {
  const drafts = getDrafts();
  return drafts[id] || null;
}

export function clearDraftSignals(): void {
  saveDrafts({});
}
