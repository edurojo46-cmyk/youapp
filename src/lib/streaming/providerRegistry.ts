import type { StreamingProviderInfo } from './streamingTypes';

export const STREAMING_PROVIDERS: Record<string, StreamingProviderInfo> = {
  netflix: {
    code: 'netflix',
    name: 'Netflix',
    logo: 'https://images.ctfassets.net/y2ske730sjqp/5QQ9SVIdc1hQWum压力9/e11bb8a4e8d350993bc2f7f90f2cf978/netflix-icon.png',
    color: '#E50914',
    badgeBg: '#141414',
    playback: 'external_provider',
    defaultWebUrl: 'https://www.netflix.com',
    isPopularInAR: true
  },
  prime_video: {
    code: 'prime_video',
    name: 'Prime Video',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Amazon_Prime_Video_logo.svg/800px-Amazon_Prime_Video_logo.svg.png',
    color: '#00A8E1',
    badgeBg: '#001A2C',
    playback: 'external_provider',
    defaultWebUrl: 'https://www.primevideo.com',
    isPopularInAR: true
  },
  disney_plus: {
    code: 'disney_plus',
    name: 'Disney+',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Disney%2B_logo.svg/800px-Disney%2B_logo.svg.png',
    color: '#113CCF',
    badgeBg: '#040714',
    playback: 'external_provider',
    defaultWebUrl: 'https://www.disneyplus.com',
    isPopularInAR: true
  },
  max: {
    code: 'max',
    name: 'Max',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Max_logo.svg/800px-Max_logo.svg.png',
    color: '#002BE7',
    badgeBg: '#000033',
    playback: 'external_provider',
    defaultWebUrl: 'https://www.max.com',
    isPopularInAR: true
  },
  apple_tv_plus: {
    code: 'apple_tv_plus',
    name: 'Apple TV+',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Apple_TV_Plus_Logo.svg/800px-Apple_TV_Plus_Logo.svg.png',
    color: '#000000',
    badgeBg: '#1C1C1E',
    playback: 'external_provider',
    defaultWebUrl: 'https://tv.apple.com',
    isPopularInAR: true
  },
  paramount_plus: {
    code: 'paramount_plus',
    name: 'Paramount+',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Paramount_Plus.svg/800px-Paramount_Plus.svg.png',
    color: '#0064FF',
    badgeBg: '#001E50',
    playback: 'external_provider',
    defaultWebUrl: 'https://www.paramountplus.com',
    isPopularInAR: true
  },
  mubi: {
    code: 'mubi',
    name: 'MUBI',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/MUBI_Logo.svg/800px-MUBI_Logo.svg.png',
    color: '#001A9C',
    badgeBg: '#000F40',
    playback: 'external_provider',
    defaultWebUrl: 'https://mubi.com',
    isPopularInAR: false
  },
  pluto_tv: {
    code: 'pluto_tv',
    name: 'Pluto TV',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Pluto_TV_logo_2020.svg/800px-Pluto_TV_logo_2020.svg.png',
    color: '#FEDE00',
    badgeBg: '#000000',
    playback: 'external_provider',
    defaultWebUrl: 'https://pluto.tv',
    isPopularInAR: true
  },
  flow: {
    code: 'flow',
    name: 'Flow',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Flow_logo.svg/800px-Flow_logo.svg.png',
    color: '#55C800',
    badgeBg: '#0F1E05',
    playback: 'external_provider',
    defaultWebUrl: 'https://www.flow.com.ar',
    isPopularInAR: true
  },
  mercado_play: {
    code: 'mercado_play',
    name: 'Mercado Play',
    logo: 'https://http2.mlstatic.com/frontend-assets/ui-navigation/5.18.9/mercadolibre/logo__large_plus.png',
    color: '#FFE600',
    badgeBg: '#2D3277',
    playback: 'external_provider',
    defaultWebUrl: 'https://play.mercadolibre.com.ar',
    isPopularInAR: true
  }
};

export const POPULAR_AR_PROVIDERS = Object.values(STREAMING_PROVIDERS).filter(p => p.isPopularInAR);

export function getProviderInfo(code: string): StreamingProviderInfo {
  const normalized = code.toLowerCase().replace(/[-\s]/g, '_');
  return STREAMING_PROVIDERS[normalized] || {
    code,
    name: code.toUpperCase(),
    logo: '',
    color: '#2563eb',
    badgeBg: '#1e293b',
    playback: 'external_provider',
    defaultWebUrl: '#'
  };
}
