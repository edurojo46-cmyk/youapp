import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface WatchCheckpoint {
  key: string;
  signalId: string;
  signalName: string;
  blockId: string;
  blockTitle: string;
  topic?: string;
  provider?: string;
  providerContentId?: string;
  thumbnailUrl?: string;
  route: string;
  positionSec: number;
  durationSec: number;
  updatedAt: string;
}

interface WatchContinuityState {
  entriesByScope: Record<string, WatchCheckpoint[]>;
  pendingResumeBlockId: string | null;
  pendingResumeSec: number | null;

  saveCheckpoint: (scopeId: string | null | undefined, cp: Omit<WatchCheckpoint, 'key' | 'updatedAt'>, forceImmediate?: boolean) => void;
  markCompleted: (scopeId: string | null | undefined, blockId: string, signalId?: string) => void;
  getLatestForUser: (scopeId: string | null | undefined, limit?: number) => WatchCheckpoint[];
  getCheckpointForBlock: (scopeId: string | null | undefined, blockId: string, signalId?: string) => WatchCheckpoint | null;
  requestResume: (blockId: string, positionSec: number) => void;
  consumePendingResume: (blockId: string) => number | null;
  clearScope: (scopeId: string | null | undefined) => void;
  migrateGuestScope: (fromScopeId: string | null | undefined, toScopeId: string) => void;
}

const MAX_ENTRIES_PER_SCOPE = 12;
const MIN_SAVE_POSITION_SEC = 5;
const COMPLETION_RATIO = 0.96;
const THROTTLE_MS = 4000;

const lastWriteByKey = new Map<string, number>();

function resolveScope(scopeId?: string | null): string {
  return scopeId && scopeId.trim() ? scopeId.trim() : 'guest_local';
}

export function formatWatchTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const useWatchContinuityStore = create<WatchContinuityState>()(
  persist(
    (set, get) => ({
      entriesByScope: {},
      pendingResumeBlockId: null,
      pendingResumeSec: null,

      saveCheckpoint: (scopeId, cp, forceImmediate = false) => {
        if (!cp.blockId || !Number.isFinite(cp.positionSec)) return;
        const pos = Math.floor(cp.positionSec);
        const dur = Math.max(0, Math.floor(cp.durationSec || 0));

        if (pos < MIN_SAVE_POSITION_SEC) return;

        // If user reached >= 96% of the video, clear it from Continue Watching
        if (dur > 20 && pos / dur >= COMPLETION_RATIO) {
          get().markCompleted(scopeId, cp.blockId, cp.signalId);
          return;
        }

        const scope = resolveScope(scopeId);
        const entryKey = `${cp.signalId || 'default'}:${cp.blockId}`;
        const throttleKey = `${scope}:${entryKey}`;
        const now = Date.now();

        if (!forceImmediate) {
          const prevTs = lastWriteByKey.get(throttleKey) || 0;
          if (now - prevTs < THROTTLE_MS) return;
        }
        lastWriteByKey.set(throttleKey, now);

        const nextEntry: WatchCheckpoint = {
          ...cp,
          signalId: cp.signalId || 'default',
          signalName: cp.signalName || 'Mi Señal TV',
          blockTitle: cp.blockTitle || ' Contenido en reproducción',
          route: cp.route || '/mitv',
          positionSec: pos,
          durationSec: dur,
          key: entryKey,
          updatedAt: new Date(now).toISOString()
        };

        set((state) => {
          const current = state.entriesByScope[scope] || [];
          const filtered = current.filter(
            (item) => item.key !== entryKey && item.blockId !== cp.blockId
          );
          return {
            entriesByScope: {
              ...state.entriesByScope,
              [scope]: [nextEntry, ...filtered].slice(0, MAX_ENTRIES_PER_SCOPE)
            }
          };
        });
      },

      markCompleted: (scopeId, blockId, signalId) => {
        const scope = resolveScope(scopeId);
        set((state) => {
          const current = state.entriesByScope[scope] || [];
          const next = current.filter((item) => {
            if (signalId) return !(item.signalId === signalId && item.blockId === blockId) && item.blockId !== blockId;
            return item.blockId !== blockId;
          });
          if (next.length === current.length) return state;
          return {
            entriesByScope: {
              ...state.entriesByScope,
              [scope]: next
            }
          };
        });
      },

      getLatestForUser: (scopeId, limit = 4) => {
        const scope = resolveScope(scopeId);
        const list = get().entriesByScope[scope] || [];
        if (list.length > 0 || scope === 'guest_local') {
          return list.slice(0, limit);
        }
        return (get().entriesByScope['guest_local'] || []).slice(0, limit);
      },

      getCheckpointForBlock: (scopeId, blockId, signalId) => {
        const list = get().getLatestForUser(scopeId, MAX_ENTRIES_PER_SCOPE);
        if (signalId) {
          const exact = list.find((x) => x.signalId === signalId && x.blockId === blockId);
          if (exact) return exact;
        }
        return list.find((x) => x.blockId === blockId) || null;
      },

      requestResume: (blockId, positionSec) => {
        set({
          pendingResumeBlockId: blockId,
          pendingResumeSec: Math.max(0, Math.floor(positionSec))
        });
      },

      consumePendingResume: (blockId) => {
        const { pendingResumeBlockId, pendingResumeSec } = get();
        if (pendingResumeBlockId === blockId && pendingResumeSec !== null) {
          set({ pendingResumeBlockId: null, pendingResumeSec: null });
          return pendingResumeSec;
        }
        return null;
      },

      clearScope: (scopeId) => {
        const scope = resolveScope(scopeId);
        set((state) => ({
          entriesByScope: {
            ...state.entriesByScope,
            [scope]: [],
            guest_local: []
          }
        }));
      },

      migrateGuestScope: (fromScopeId, toScopeId) => {
        if (!toScopeId) return;
        const target = resolveScope(toScopeId);
        const sources = Array.from(
          new Set([resolveScope(fromScopeId), 'guest_local'].filter((s) => s !== target))
        );
        set((state) => {
          const existingTarget = state.entriesByScope[target] || [];
          const mergedMap = new Map<string, WatchCheckpoint>();
          for (const item of existingTarget) mergedMap.set(item.key, item);
          for (const src of sources) {
            for (const item of state.entriesByScope[src] || []) {
              const cur = mergedMap.get(item.key);
              if (!cur || new Date(item.updatedAt).getTime() > new Date(cur.updatedAt).getTime()) {
                mergedMap.set(item.key, item);
              }
            }
          }
          const merged = Array.from(mergedMap.values())
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, MAX_ENTRIES_PER_SCOPE);
          return {
            entriesByScope: {
              ...state.entriesByScope,
              [target]: merged
            }
          };
        });
      }
    }),
    {
      name: 'youapp_tv_watch_continuity_v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ entriesByScope: state.entriesByScope })
    }
  )
);
