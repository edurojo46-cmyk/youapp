import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CustomSignal, ScheduleBlock } from './signalTypes';
import { persistSignal, persistScheduleMutation, logSignalEvent } from './signalPersistence';

export interface SignalState {
  activeSignal: CustomSignal | null;
  savedSignalsById: Record<string, CustomSignal>;
  currentBlockId: string | null;
  currentBlockIndex: number;
  persistStatus: 'local' | 'saving' | 'saved' | 'failed';

  // Actions
  setSignal: (signal: CustomSignal, options?: { saveToOwn?: boolean }) => void;
  removeSavedSignal: (signalId: string) => void;
  mergeCloudSignals: (signals: CustomSignal[]) => void;
  renameSignal: (newName: string) => void;
  getSavedSignal: (signalId: string) => CustomSignal | null;
  setPersistStatus: (status: 'local' | 'saving' | 'saved' | 'failed') => void;
  next: () => void;
  previous: () => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  moveChannelGroup: (channelKey: string, direction: 'up' | 'down') => void;
  removeChannelGroup: (channelKey: string) => void;
  remove: (blockId: string) => void;
  replace: (blockId: string, newBlock: ScheduleBlock) => void;
  insert: (block: ScheduleBlock, afterPosition: number) => void;
  jumpTo: (blockId: string) => void;
}

function recalculateOffsets(schedule: ScheduleBlock[]): ScheduleBlock[] {
  let currentSec = 0;
  const seenIds = new Set<string>();
  const validSchedule: ScheduleBlock[] = [];
  
  for (let i = 0; i < schedule.length; i++) {
    const block = schedule[i];
    
    // Invariant 3: contentKey sin duplicados
    const contentKey = block.contentItem.id || block.id;
    if (seenIds.has(contentKey)) continue; // skip duplicate content
    seenIds.add(contentKey);
    
    // Invariant 1 & 2: positions = 0..N-1 and startOffsetSec siempre creciente
    const updated = { 
      ...block, 
      position: validSchedule.length, 
      startOffsetSec: currentSec 
    };
    currentSec += Math.max(1, block.durationSec || 1); // Ensure always strictly growing
    validSchedule.push(updated);
  }
  
  return validSchedule;
}

export const useSignalStore = create<SignalState>()(
  persist(
    (set, get) => ({
      activeSignal: null,
      savedSignalsById: {},
      currentBlockId: null,
      currentBlockIndex: 0,
      persistStatus: 'local',

      setPersistStatus: (status) => set({ persistStatus: status }),

      getSavedSignal: (signalId) => {
        if (!signalId) return null;
        const map = get().savedSignalsById || {};
        if (map[signalId]) return map[signalId];
        return (
          Object.values(map).find(
            (s) => s?.id === signalId || (s as any)?.clientSignalId === signalId
          ) || null
        );
      },

      setSignal: (signal, options) => {
        const shouldSave = options?.saveToOwn !== false;
        set((state) => ({
          activeSignal: signal,
          savedSignalsById: shouldSave
            ? {
                ...(state.savedSignalsById || {}),
                [signal.id]: signal
              }
            : state.savedSignalsById || {},
          currentBlockId: signal.schedule[0]?.id || null,
          currentBlockIndex: 0,
        }));
      },

      removeSavedSignal: (signalId) => {
        if (!signalId) return;
        set((state) => {
          const nextSaved = { ...(state.savedSignalsById || {}) };
          delete nextSaved[signalId];
          return { savedSignalsById: nextSaved };
        });
      },

      mergeCloudSignals: (signals: CustomSignal[]) => {
        if (!signals?.length) return;
        set((state) => {
          const nextSaved = { ...(state.savedSignalsById || {}) };
          for (const cloudSig of signals) {
            const localSig = nextSaved[cloudSig.id];
            const cloudTs = Date.parse(cloudSig.updated_at || '') || 0;
            const localTs = Date.parse(localSig?.updated_at || '') || 0;
            if (!localSig || cloudTs > localTs) {
              nextSaved[cloudSig.id] = cloudSig;
            }
          }
          const activeId = state.activeSignal?.id;
          const updatedActive =
            activeId && nextSaved[activeId] && nextSaved[activeId] !== state.activeSignal
              ? nextSaved[activeId]
              : state.activeSignal;
          return {
            savedSignalsById: nextSaved,
            activeSignal: updatedActive,
            persistStatus: 'saved'
          };
        });
      },

      renameSignal: (newName: string) => {
        const cleaned = newName.trim();
        if (!cleaned) return;
        const { activeSignal } = get();
        if (!activeSignal) return;
        const updatedSignal: CustomSignal = {
          ...activeSignal,
          name: cleaned,
          updated_at: new Date().toISOString()
        };
        set((state) => ({
          activeSignal: updatedSignal,
          savedSignalsById: {
            ...(state.savedSignalsById || {}),
            [updatedSignal.id]: updatedSignal
          },
          persistStatus: 'saving'
        }));
        persistSignal(updatedSignal)
          .then((ok) => set({ persistStatus: ok ? 'saved' : 'local' }))
          .catch(() => set({ persistStatus: 'local' }));
      },

      next: () => {
        const { activeSignal, currentBlockIndex } = get();
        if (!activeSignal || currentBlockIndex >= activeSignal.schedule.length - 1) {
          // Reached the end
          return;
        }
        const newIndex = currentBlockIndex + 1;
        set({
          currentBlockIndex: newIndex,
          currentBlockId: activeSignal.schedule[newIndex].id
        });
      },

      previous: () => {
        const { activeSignal, currentBlockIndex } = get();
        if (!activeSignal || currentBlockIndex <= 0) return;
        
        const newIndex = currentBlockIndex - 1;
        set({
          currentBlockIndex: newIndex,
          currentBlockId: activeSignal.schedule[newIndex].id
        });
      },

      jumpTo: (blockId: string) => {
        const { activeSignal } = get();
        if (!activeSignal) return;
        
        const index = activeSignal.schedule.findIndex(b => b.id === blockId);
        if (index !== -1) {
          set({
            currentBlockIndex: index,
            currentBlockId: blockId
          });
        }
      },

      reorder: (fromIndex: number, toIndex: number) => {
        const { activeSignal, currentBlockId } = get();
        if (!activeSignal) return;

        const schedule = [...activeSignal.schedule];
        const [moved] = schedule.splice(fromIndex, 1);
        schedule.splice(toIndex, 0, moved);

        const newSchedule = recalculateOffsets(schedule);
        
        let newIndex = 0;
        let newBlockId = currentBlockId;

        if (currentBlockId) {
          newIndex = newSchedule.findIndex(b => b.id === currentBlockId);
          if (newIndex === -1) {
            newIndex = 0; // Invariant: If current block disappeared due to deduplication, reset to 0
            newBlockId = newSchedule[0]?.id || null;
          }
        }

        const updatedSignal = { ...activeSignal, schedule: newSchedule, updated_at: new Date().toISOString() };
        set((state) => ({
          activeSignal: updatedSignal,
          savedSignalsById: {
            ...(state.savedSignalsById || {}),
            [updatedSignal.id]: updatedSignal
          },
          currentBlockIndex: newIndex,
          currentBlockId: newBlockId
        }));

        // Optimistic persistence
        persistScheduleMutation(activeSignal.id, newSchedule.map(b => b.id));
        logSignalEvent(activeSignal.id, null, 'block_reordered', { fromIndex, toIndex });
      },

      moveChannelGroup: (channelKey: string, direction: 'up' | 'down') => {
        const { activeSignal, currentBlockId } = get();
        if (!activeSignal) return;
        const normKey = channelKey.trim().toLowerCase();

        const groups: { key: string; blocks: ScheduleBlock[] }[] = [];
        const byKey = new Map<string, { key: string; blocks: ScheduleBlock[] }>();
        for (const blk of activeSignal.schedule) {
          const chName =
            blk.contentItem.channelTitle ||
            (blk.contentItem as any).channelName ||
            activeSignal.name ||
            'canal original';
          const k = chName.trim().toLowerCase();
          let g = byKey.get(k);
          if (!g) {
            g = { key: k, blocks: [] };
            byKey.set(k, g);
            groups.push(g);
          }
          g.blocks.push(blk);
        }

        const idx = groups.findIndex((g) => g.key === normKey);
        if (idx === -1) return;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= groups.length) return;

        const [moved] = groups.splice(idx, 1);
        groups.splice(targetIdx, 0, moved);

        const flat = groups.flatMap((g) => g.blocks);
        const newSchedule = recalculateOffsets(flat);
        let newIndex = currentBlockId ? newSchedule.findIndex((b) => b.id === currentBlockId) : 0;
        let newBlockId = currentBlockId;
        if (newIndex === -1) {
          newIndex = 0;
          newBlockId = newSchedule[0]?.id || null;
        }

        const updatedSignal = { ...activeSignal, schedule: newSchedule, updated_at: new Date().toISOString() };
        set((state) => ({
          activeSignal: updatedSignal,
          savedSignalsById: {
            ...(state.savedSignalsById || {}),
            [updatedSignal.id]: updatedSignal
          },
          currentBlockIndex: newIndex,
          currentBlockId: newBlockId
        }));
        persistScheduleMutation(activeSignal.id, newSchedule.map((b) => b.id));
      },

      removeChannelGroup: (channelKey: string) => {
        const { activeSignal, currentBlockId } = get();
        if (!activeSignal) return;
        const normKey = channelKey.trim().toLowerCase();

        const remaining = activeSignal.schedule.filter((blk) => {
          const chName =
            blk.contentItem.channelTitle ||
            (blk.contentItem as any).channelName ||
            activeSignal.name ||
            'canal original';
          return chName.trim().toLowerCase() !== normKey;
        });

        const newSchedule = recalculateOffsets(remaining);
        let newIndex = currentBlockId ? newSchedule.findIndex((b) => b.id === currentBlockId) : 0;
        let newBlockId = currentBlockId;
        if (newIndex === -1) {
          newIndex = 0;
          newBlockId = newSchedule[0]?.id || null;
        }

        const updatedSignal = { ...activeSignal, schedule: newSchedule, updated_at: new Date().toISOString() };
        set((state) => ({
          activeSignal: updatedSignal,
          savedSignalsById: {
            ...(state.savedSignalsById || {}),
            [updatedSignal.id]: updatedSignal
          },
          currentBlockIndex: Math.max(0, newIndex),
          currentBlockId: newBlockId
        }));
        persistScheduleMutation(activeSignal.id, newSchedule.map((b) => b.id));
      },

      remove: (blockId: string) => {
        const { activeSignal, currentBlockId } = get();
        if (!activeSignal) return;

        const schedule = activeSignal.schedule.filter(b => b.id !== blockId);
        const newSchedule = recalculateOffsets(schedule);
        
        let newIndex = 0;
        let newBlockId = currentBlockId;
        
        if (currentBlockId === blockId || newSchedule.findIndex(b => b.id === currentBlockId) === -1) {
          // If we deleted the current playing block, skip to next (which is now at the old index)
          const oldIndex = activeSignal.schedule.findIndex(b => b.id === blockId);
          newIndex = Math.min(oldIndex, newSchedule.length - 1);
          newBlockId = newSchedule[newIndex]?.id || null;
        } else {
          newIndex = newSchedule.findIndex(b => b.id === currentBlockId);
        }

        const updatedSignal = { ...activeSignal, schedule: newSchedule, updated_at: new Date().toISOString() };
        set((state) => ({
          activeSignal: updatedSignal,
          savedSignalsById: {
            ...(state.savedSignalsById || {}),
            [updatedSignal.id]: updatedSignal
          },
          currentBlockIndex: Math.max(0, newIndex),
          currentBlockId: newBlockId
        }));

        // Optimistic persistence
        persistScheduleMutation(activeSignal.id, newSchedule.map(b => b.id));
        logSignalEvent(activeSignal.id, blockId, 'block_removed');
      },

      replace: (blockId: string, newBlock: ScheduleBlock) => {
        const { activeSignal, currentBlockId } = get();
        if (!activeSignal) return;

        const schedule = [...activeSignal.schedule];
        const index = schedule.findIndex(b => b.id === blockId);
        if (index !== -1) {
          schedule[index] = newBlock;
          const newSchedule = recalculateOffsets(schedule);
          
          let newIndex = newSchedule.findIndex(b => b.id === currentBlockId);
          let newBlockId = currentBlockId;
          
          if (currentBlockId === blockId) {
            newIndex = newSchedule.findIndex(b => b.id === newBlock.id);
            newBlockId = newBlock.id;
          }

          set({
            activeSignal: { ...activeSignal, schedule: newSchedule },
            currentBlockIndex: Math.max(0, newIndex),
            currentBlockId: newBlockId
          });

          // Optimistic persistence
          persistScheduleMutation(activeSignal.id, newSchedule.map(b => b.id));
          logSignalEvent(activeSignal.id, blockId, 'block_replaced');
        }
      },

      insert: (block: ScheduleBlock, afterPosition: number) => {
        const { activeSignal, currentBlockId } = get();
        if (!activeSignal) return;

        const schedule = [...activeSignal.schedule];
        schedule.splice(afterPosition + 1, 0, block);
        
        const newSchedule = recalculateOffsets(schedule);
        let newIndex = newSchedule.findIndex(b => b.id === currentBlockId);
        let newBlockId = currentBlockId;
        
        if (newIndex === -1) {
          newIndex = 0;
          newBlockId = newSchedule[0]?.id || null;
        }

        const updatedSignal = { ...activeSignal, schedule: newSchedule, updated_at: new Date().toISOString() };
        set((state) => ({
          activeSignal: updatedSignal,
          savedSignalsById: {
            ...(state.savedSignalsById || {}),
            [updatedSignal.id]: updatedSignal
          },
          currentBlockIndex: newIndex,
          currentBlockId: newBlockId
        }));

        // Optimistic persistence
        persistScheduleMutation(activeSignal.id, newSchedule.map(b => b.id));
        logSignalEvent(activeSignal.id, block.id, 'surprise_inserted');
      }
    }),
    {
      name: 'youapp_tv_signal_store',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
