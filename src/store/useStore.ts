import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface User {
  id: string;
  email?: string;
  name?: string;
}

interface AppState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  activeChannelId: string | null;
  setActiveChannel: (id: string) => void;
  initAuth: () => void;
  signOut: () => Promise<void>;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  activeChannelId: null,
  setActiveChannel: (id) => set({ activeChannelId: id }),
  initAuth: () => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        set({ user: { id: session.user.id, email: session.user.email }, loading: false });
      } else {
        set({ user: null, loading: false });
      }
    });

    // Listen for auth changes
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

