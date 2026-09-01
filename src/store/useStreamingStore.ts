import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { streamingRepository } from '../lib/streaming/streamingRepository';
import type { UniversalContent } from '../lib/streaming/streamingTypes';

interface StreamingState {
  userPlatforms: string[]; // ['netflix', 'prime_video', 'disney_plus', ...]
  savedLibrary: UniversalContent[];
  activePlatformFilter: string; // 'my_platforms' | 'all' | 'netflix' | ...
  searchQuery: string;
  onlyMyPlatforms: boolean;
  selectedContentForDetails: UniversalContent | null;
  isPlatformsModalOpen: boolean;
  isSyncing: boolean;

  // Actions
  togglePlatform: (code: string) => void;
  setPlatformEnabled: (code: string, enabled: boolean) => void;
  isPlatformEnabled: (code: string) => boolean;
  
  toggleSaveLibrary: (content: UniversalContent) => void;
  isInLibrary: (id: string) => boolean;

  setActivePlatformFilter: (code: string) => void;
  setSearchQuery: (query: string) => void;
  setOnlyMyPlatforms: (only: boolean) => void;
  setSelectedContentForDetails: (content: UniversalContent | null) => void;
  setIsPlatformsModalOpen: (open: boolean) => void;

  // Repository Sync
  syncWithSupabase: () => Promise<void>;
  logStreamingActivity: (content: UniversalContent) => Promise<void>;
}

export const useStreamingStore = create<StreamingState>()(
  persist(
    (set, get) => ({
      userPlatforms: ['netflix', 'prime_video', 'disney_plus'],
      savedLibrary: [],
      activePlatformFilter: 'my_platforms',
      searchQuery: '',
      onlyMyPlatforms: true,
      selectedContentForDetails: null,
      isPlatformsModalOpen: false,
      isSyncing: false,

      togglePlatform: (code) => {
        const current = get().userPlatforms;
        const enabled = !current.includes(code);
        const next = enabled
          ? [...current, code]
          : current.filter(c => c !== code);

        set({ userPlatforms: next });

        // Delegate persistence to repository
        (async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              await streamingRepository.saveUserPlatform(user.id, code, enabled);
            }
          } catch {
            // silent sync
          }
        })();
      },

      setPlatformEnabled: (code, enabled) => {
        const current = get().userPlatforms;
        if (enabled && !current.includes(code)) {
          set({ userPlatforms: [...current, code] });
        } else if (!enabled && current.includes(code)) {
          set({ userPlatforms: current.filter(c => c !== code) });
        }
      },

      isPlatformEnabled: (code) => {
        return get().userPlatforms.includes(code);
      },

      toggleSaveLibrary: (content) => {
        const current = get().savedLibrary;
        const exists = current.some(item => item.id === content.id);
        const next = exists
          ? current.filter(item => item.id !== content.id)
          : [content, ...current];

        set({ savedLibrary: next });

        // Delegate persistence to repository
        (async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              if (exists) {
                await streamingRepository.removeFromUserLibrary(user.id, content.id);
              } else {
                await streamingRepository.saveToUserLibrary(user.id, content);
              }
            }
          } catch {
            // silent sync
          }
        })();
      },

      isInLibrary: (id) => {
        return get().savedLibrary.some(item => item.id === id);
      },

      setActivePlatformFilter: (code) => {
        set({ 
          activePlatformFilter: code,
          onlyMyPlatforms: code === 'my_platforms'
        });
      },

      setSearchQuery: (query) => set({ searchQuery: query }),
      setOnlyMyPlatforms: (only) => set({ onlyMyPlatforms: only }),
      setSelectedContentForDetails: (content) => set({ selectedContentForDetails: content }),
      setIsPlatformsModalOpen: (open) => set({ isPlatformsModalOpen: open }),

      syncWithSupabase: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          set({ isSyncing: true });

          // 1. Fetch user platforms via repository
          const platforms = await streamingRepository.fetchUserPlatforms(user.id);
          if (platforms && platforms.length > 0) {
            set({ userPlatforms: platforms });
          }

          // 2. Fetch user library via repository
          const library = await streamingRepository.fetchUserLibrary(user.id);
          if (library && library.length > 0) {
            set({ savedLibrary: library });
          }
        } catch {
          // offline fallback
        } finally {
          set({ isSyncing: false });
        }
      },

      logStreamingActivity: async (content) => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await streamingRepository.logUserActivity(user.id, content);
          }
        } catch {
          // silent logging
        }
      }
    }),
    {
      name: 'youapp_streaming_storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        userPlatforms: state.userPlatforms,
        savedLibrary: state.savedLibrary,
        onlyMyPlatforms: state.onlyMyPlatforms,
        activePlatformFilter: state.activePlatformFilter
      })
    }
  )
);
