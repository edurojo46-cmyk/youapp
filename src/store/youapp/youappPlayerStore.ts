import { create } from 'zustand';

export interface YouAppPlayerState {
  activeChannelId: string | null;
  setActiveChannel: (id: string) => void;
}

export const useYouAppPlayerStore = create<YouAppPlayerState>((set) => ({
  activeChannelId: null,
  setActiveChannel: (id: string) => set({ activeChannelId: id })
}));
