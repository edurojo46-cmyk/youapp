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
};

export type PlaybackCapabilities = {
  autoplay: boolean;
  seek: boolean;
  fullscreen: boolean;
  captions: boolean;
  volumeControl: boolean;
  embedded: boolean;
};

export type PlayerEventType = 
  | 'ready'
  | 'play'
  | 'pause'
  | 'ended'
  | 'error'
  | 'unavailable'
  | 'progress';

export type PlayerEvent = {
  type: PlayerEventType;
  payload?: any;
};

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
