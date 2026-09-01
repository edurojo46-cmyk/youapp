import type { ContentItem } from '../search/types';

export interface SmartBarCapabilities {
  summary: boolean;
  you4: boolean;
  ask: boolean;
  save: boolean;
  share: boolean;
  followCreator: boolean;
  addToSignal: boolean;
}

export function getSmartBarCapabilities(content?: ContentItem | null): SmartBarCapabilities {
  // Base capabilities that apply to almost everything inside YouApp
  const base = {
    summary: true,
    you4: true,
    ask: true,
    save: true,
    share: true,
    followCreator: true,
    addToSignal: true
  };

  if (!content) return base;

  // Logic per provider
  if (content.provider === 'youtube' || content.provider === 'vimeo') {
    return base; 
  }

  // Example: Future Netflix/Prime support
  if (content.provider === 'netflix' as any) {
    return {
      ...base,
      you4: false, // Netflix might not have moments available
      ask: false, // Maybe we don't have subtitles for ask
      followCreator: false // No creators in Netflix, just shows
    };
  }

  // Example: Live streams
  if (content.isLive) {
    return {
      ...base,
      summary: false, // Can't summarize an ongoing stream yet
      you4: false // Moments are not available live usually
    };
  }

  return base;
}
