import { create } from 'zustand';
import type { PlaybackItem } from '../lib/player/playerTypes';

export interface PlayerApi {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (sec: number) => Promise<void>;
  mute: () => Promise<void>;
  unmute: () => Promise<void>;
  getDuration: () => number;
}

export type PlaybackStateType = 
  | 'idle'
  | 'loading'
  | 'ready'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error'
  | 'cued';

interface PlayerState {
  playbackState: PlaybackStateType;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentBlock: PlaybackItem | null;
  
  // Metadata for Smart Bar contextual rendering
  isLive: boolean;
  creator: string | null;
  signalName: string | null;
  you4Moments: any[];
  isAnalyzingYOU4: boolean;

  // Exposed API from player to control playback from anywhere
  playerApi: PlayerApi | null;

  // Actions
  setPlaybackState: (state: PlaybackStateType) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setProgress: (currentTime: number, duration: number) => void;
  setCurrentBlock: (block: PlaybackItem | null) => void;
  setPlaybackContext: (context: Partial<PlayerState>) => void;
  setPlayerApi: (api: PlayerApi | null) => void;
  setIsAnalyzingYOU4: (analyzing: boolean) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  playbackState: 'idle',
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  currentBlock: null,

  isLive: false,
  creator: null,
  signalName: null,
  you4Moments: [],
  isAnalyzingYOU4: false,

  playerApi: null,

  setPlaybackState: (playbackState) => set({ playbackState, isPlaying: playbackState === 'playing' }),
  setIsPlaying: (isPlaying) => set({ isPlaying, playbackState: isPlaying ? 'playing' : 'paused' }),
  setProgress: (currentTime, duration) => set({ currentTime, duration }),
  setCurrentBlock: (block) => set({ currentBlock: block }),
  setPlaybackContext: (context) => set((state) => ({ ...state, ...context })),
  setPlayerApi: (api) => set({ playerApi: api }),
  setIsAnalyzingYOU4: (analyzing) => set({ isAnalyzingYOU4: analyzing }),
}));
