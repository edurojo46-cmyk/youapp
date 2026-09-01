import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CustomSignal, ScheduleBlock } from './signalTypes';
import { persistScheduleMutation, logSignalEvent } from './signalPersistence';

export interface SignalState {
  activeSignal: CustomSignal | null;
  currentBlockId: string | null;
  currentBlockIndex: number;
  persistStatus: 'local' | 'saving' | 'saved' | 'failed';

  // Actions
  setSignal: (signal: CustomSignal) => void;
  setPersistStatus: (status: 'local' | 'saving' | 'saved' | 'failed') => void;
  next: () => void;
  previous: () => void;
  reorder: (fromIndex: number, toIndex: number) => void;
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
      currentBlockId: null,
      currentBlockIndex: 0,
      persistStatus: 'local',

      setPersistStatus: (status) => set({ persistStatus: status }),

      setSignal: (signal) => {
        set({
          activeSignal: signal,
          currentBlockId: signal.schedule[0]?.id || null,
          currentBlockIndex: 0,
        });
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

        set({
          activeSignal: { ...activeSignal, schedule: newSchedule },
          currentBlockIndex: newIndex,
          currentBlockId: newBlockId
        });

        // Optimistic persistence
        persistScheduleMutation(activeSignal.id, newSchedule.map(b => b.id));
        logSignalEvent(activeSignal.id, null, 'block_reordered', { fromIndex, toIndex });
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

        set({
          activeSignal: { ...activeSignal, schedule: newSchedule },
          currentBlockIndex: Math.max(0, newIndex),
          currentBlockId: newBlockId
        });

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

        set({
          activeSignal: { ...activeSignal, schedule: newSchedule },
          currentBlockIndex: newIndex,
          currentBlockId: newBlockId
        });

        // Optimistic persistence
        persistScheduleMutation(activeSignal.id, newSchedule.map(b => b.id));
        logSignalEvent(activeSignal.id, block.id, 'surprise_inserted');
      }
    }),
    {
      name: 'youapp_tv_signal_store',
      storage: createJSONStorage(() => sessionStorage), // or localStorage
    }
  )
);
