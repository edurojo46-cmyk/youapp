import type { PlaybackProvider, PlayerAdapter } from './playerTypes';
import { YouTubePlayerAdapter } from './adapters/youtubePlayerAdapter';
import { VimeoPlayerAdapter } from './adapters/vimeoPlayerAdapter';
import { NativePlayerAdapter } from './adapters/nativePlayerAdapter';

export function createPlayerAdapter(provider: PlaybackProvider, container: HTMLElement): PlayerAdapter {
  switch (provider) {
    case 'youtube':
      return new YouTubePlayerAdapter(container);
    case 'vimeo':
      return new VimeoPlayerAdapter(container);
    case 'native':
    case 'archive':
    case 'peertube':
      // For Phase 5.1, peertube and archive use native HTML5 video if they have direct URLs
      return new NativePlayerAdapter(container);
    default:
      // Fallback
      return new NativePlayerAdapter(container);
  }
}
