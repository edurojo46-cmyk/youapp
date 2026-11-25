import type { ContentItem } from '../search/types';

export interface SmartBarCapabilities {
  summary: boolean;
  you4: boolean;
  ask: boolean;
  save: boolean;
  share: boolean;
  followCreator: boolean;
  addToSignal: boolean;
  /**
   * True únicamente cuando YOUAPP controla legítimamente el reproductor (ej. MP4 / HLS propio).
   * Para YouTube, Vimeo u otros proveedores embebidos es false: respetamos sus controles nativos
   * y nuestra Barra Viva debajo actúa como capa independiente de descubrimiento y navegación.
   */
  ownsPlayerControls: boolean;
}

export function getSmartBarCapabilities(content?: ContentItem | null): SmartBarCapabilities {
  const provider = String(content?.provider || '').toLowerCase();
  const ownsPlayerControls = provider === 'direct' || provider === 'hls' || provider === 'native';

  const base: SmartBarCapabilities = {
    summary: true,
    you4: true,
    ask: true,
    save: true,
    share: true,
    followCreator: true,
    addToSignal: true,
    ownsPlayerControls
  };

  if (!content) return base;

  if (provider === 'youtube' || provider === 'vimeo') {
    return base;
  }

  if (provider === 'netflix') {
    return {
      ...base,
      you4: false,
      ask: false,
      followCreator: false,
      ownsPlayerControls: false
    };
  }

  if (content.isLive) {
    return {
      ...base,
      summary: false,
      you4: false
    };
  }

  return base;
}
