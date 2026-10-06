import type { ContentItem } from '../../search/types';

export type PlaybackMode = 'embed' | 'native' | 'external' | 'unsupported';

export interface PlaybackResolution {
  mode: PlaybackMode;
  provider: string;
  src?: string;
  
  autoplaySupported: boolean;
  endedEventSupported: boolean;
  progressTrackingSupported: boolean;
  
  externalUrl?: string;
}

export function resolvePlayback(item: ContentItem): PlaybackResolution {
  // Helper to extract YouTube ID if needed
  const getYouTubeId = (url: string) => {
    if (!url) return null;
    const match = url.match(/(?:embed\/|v=|vi\/|youtu\.be\/|\/v\/|\/e\/|watch\?v=)([^#&?]*).*/);
    return (match && match[1] && match[1].length === 11) ? match[1] : null;
  };
  
  // Helper to extract Vimeo ID if needed
  const getVimeoId = (url: string) => {
    if (!url) return null;
    const match = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
    return match ? match[1] : null;
  };

  if (item.provider === 'youtube') {
    const ytId = item.providerId || (item as any).providerContentId || getYouTubeId(item.videoUrl) || (item.id && !item.id.includes('youapp_') && !item.id.includes('mock-') ? item.id : null);
    if (ytId) {
      return {
        mode: 'embed',
        provider: 'youtube',
        src: `https://www.youtube.com/embed/${ytId}?enablejsapi=1&autoplay=1`,
        autoplaySupported: true,
        endedEventSupported: true,
        progressTrackingSupported: true
      };
    }
  }

  if (item.provider === 'vimeo') {
    const vimeoId = item.providerId || getVimeoId(item.videoUrl) || (item.id && !item.id.includes('youapp_') && !item.id.includes('mock-') ? item.id : null);
    if (vimeoId) {
      return {
        mode: 'embed',
        provider: 'vimeo',
        src: `https://player.vimeo.com/video/${vimeoId}?api=1&autoplay=1`,
        autoplaySupported: true,
        endedEventSupported: true,
        progressTrackingSupported: true
      };
    }
  }

  if ((item.provider as string) === 'archive' && item.videoUrl?.endsWith('.mp4')) {
    return {
      mode: 'native',
      provider: 'archive',
      src: item.videoUrl,
      autoplaySupported: true,
      endedEventSupported: true,
      progressTrackingSupported: true
    };
  }

  // Generic fallback for any direct MP4 URL (e.g. from MockAdapter)
  if (item.videoUrl?.endsWith('.mp4')) {
    return {
      mode: 'native',
      provider: item.provider,
      src: item.videoUrl,
      autoplaySupported: true,
      endedEventSupported: true,
      progressTrackingSupported: true
    };
  }

  // Publisher articles and external links
  if ((item.provider as string) === 'publisher' || (item.provider as string) === 'discover') {
    return {
      mode: 'external',
      provider: item.provider,
      externalUrl: item.videoUrl || item.canonicalUrl,
      autoplaySupported: false,
      endedEventSupported: false,
      progressTrackingSupported: false
    };
  }

  return {
    mode: 'unsupported',
    provider: item.provider || 'unknown',
    autoplaySupported: false,
    endedEventSupported: false,
    progressTrackingSupported: false
  };
}

export interface PlaybackAdapter {
  play(): void;
  pause(): void;
  getProgress(): number;
  
  onEnded(callback: () => void): void;
  onError(callback: (err?: any) => void): void;
  destroy(): void;
}
