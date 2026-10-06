import { create } from 'zustand';
import { supabase } from '../../lib/supabase';

export interface User {
  id: string;
  email?: string;
  name?: string;
}

export interface AtlasAuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  initAuth: () => void;
  signOut: () => Promise<void>;
}

export const useAtlasAuthStore = create<AtlasAuthState>((set) => ({
  user: null,
  loading: true,

  setUser: (user) => set({ user }),

  initAuth: () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        set({ user: { id: session.user.id, email: session.user.email }, loading: false });
      } else {
        // If no session, create an anonymous guest session
        supabase.auth.signInAnonymously().then(({ data, error }) => {
          if (error || !data.user) {
            console.error('Anonymous sign-in failed:', error);
            set({ user: null, loading: false });
          } else {
            set({ user: { id: data.user.id, email: undefined }, loading: false });
          }
        });
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        set({ user: { id: session.user.id, email: session.user.email }, loading: false });
      } else {
        set({ user: null, loading: false });
      }
    });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null });
  }
}));

// Alias for semantic clarity
export const useAtlasUserStore = useAtlasAuthStore;
