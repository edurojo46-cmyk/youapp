export type PlaybackProvider = 'youtube' | 'vimeo' | 'archive' | 'peertube' | 'native';

export type PlaybackItem = {
  blockId: string;
  provider: PlaybackProvider;
  providerContentId: string;
  playbackUrl?: string;
  title: string;
  durationSec?: number;
  startOffsetSec?: number;
  endOffsetSec?: number;
  muted?: boolean;
  autoplay?: boolean;
};

export type PlaybackCapabilities = {
  autoplay: boolean;
  seek: boolean;
  fullscreen: boolean;
  captions: boolean;
  volumeControl: boolean;
  embedded: boolean;
};

export type PlaybackState =
  | 'idle'
  | 'ready'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error';

export type PlayerEvent = 
  | { type: 'ready' }
  | { type: 'state'; state: PlaybackState }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'buffering' }
  | { type: 'cued' }
  | { type: 'ended' }
  | { type: 'error'; payload?: any }
  | { type: 'unavailable'; payload?: any }
  | { type: 'progress'; payload?: { currentTime: number; duration: number; milestone?: number } };

export type PlayerEventListener = (event: PlayerEvent) => void;

export interface PlayerAdapter {
  load(item: PlaybackItem): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  mute(): Promise<void>;
  unmute(): Promise<void>;

  getCurrentTime(): number;
  getDuration(): number;

  getCapabilities(): PlaybackCapabilities;

  subscribe(listener: PlayerEventListener): () => void;

  destroy(): Promise<void>;
}
