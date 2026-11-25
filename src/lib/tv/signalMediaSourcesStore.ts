const MEDIA_SOURCES_KEY = 'youapp_signal_media_sources_v1';

export interface SignalAudioSource {
  id: string;
  title: string;
  author: string;
  streamUrl: string;
  originUrl?: string;
  kind: 'radio' | 'music' | 'podcast';
  addedAt: string;
}

export interface SignalNewsSource {
  id: string;
  title: string;
  sourceName: string;
  articleUrl: string;
  summary?: string;
  addedAt: string;
}

export interface SignalMediaBundle {
  audio: SignalAudioSource[];
  news: SignalNewsSource[];
}

export const STARTER_AUDIO_PRESETS: Omit<SignalAudioSource, 'id' | 'addedAt'>[] = [
  {
    title: 'LRA1 Radio Nacional Argentina · En vivo',
    author: 'Radio Nacional',
    streamUrl: 'https://sa.mp3.icecast.magma.edge-access.net/sc_rad1',
    originUrl: 'https://www.radionacional.com.ar/',
    kind: 'radio'
  },
  {
    title: 'Radio Rivadavia AM 630 · Vivo',
    author: 'Rivadavia AM 630',
    streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RIVADAVIA.mp3',
    originUrl: 'https://rivadavia.com.ar/',
    kind: 'radio'
  },
  {
    title: 'Cadena 3 Argentina · Vivo',
    author: 'Cadena 3',
    streamUrl: 'https://liveradio.mediainbox.net/radio3.mp3',
    originUrl: 'https://www.cadena3.com/',
    kind: 'radio'
  }
];

function readAllBundles(): Record<string, SignalMediaBundle> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MEDIA_SOURCES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAllBundles(map: Record<string, SignalMediaBundle>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MEDIA_SOURCES_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export function readSignalMediaBundle(signalId: string): SignalMediaBundle {
  const all = readAllBundles();
  const entry = all[signalId];
  const rawAudio: SignalAudioSource[] = Array.isArray(entry?.audio) ? entry.audio : [];
  // Auto-corrige URLs de radio viejas que usaban puerto :7200 o hosts temporales
  const audio = rawAudio.map((a) => {
    if (a.streamUrl.includes('edge-access.net:7200/sc_rad1')) {
      return { ...a, streamUrl: 'https://sa.mp3.icecast.magma.edge-access.net/sc_rad1' };
    }
    if (a.streamUrl.includes('26573.live.streamtheworld.com/RIVADAVIAAAC.aac')) {
      return { ...a, streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RIVADAVIA.mp3' };
    }
    if (a.streamUrl.includes('24273.live.streamtheworld.com/CADENA3AAC.aac')) {
      return { ...a, streamUrl: 'https://liveradio.mediainbox.net/radio3.mp3' };
    }
    return a;
  });
  return {
    audio,
    news: Array.isArray(entry?.news) ? entry.news : []
  };
}

export function addSignalAudioSource(
  signalId: string,
  input: Omit<SignalAudioSource, 'id' | 'addedAt'>
): SignalMediaBundle {
  const all = readAllBundles();
  const cur = readSignalMediaBundle(signalId);
  const nextItem: SignalAudioSource = {
    ...input,
    id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    addedAt: new Date().toISOString()
  };
  const nextBundle: SignalMediaBundle = {
    ...cur,
    audio: [nextItem, ...cur.audio]
  };
  all[signalId] = nextBundle;
  writeAllBundles(all);
  return nextBundle;
}

export function removeSignalAudioSource(signalId: string, audioId: string): SignalMediaBundle {
  const all = readAllBundles();
  const cur = readSignalMediaBundle(signalId);
  const nextBundle: SignalMediaBundle = {
    ...cur,
    audio: cur.audio.filter((a) => a.id !== audioId)
  };
  all[signalId] = nextBundle;
  writeAllBundles(all);
  return nextBundle;
}

export function addSignalNewsSource(
  signalId: string,
  input: Omit<SignalNewsSource, 'id' | 'addedAt'>
): SignalMediaBundle {
  const all = readAllBundles();
  const cur = readSignalMediaBundle(signalId);
  const nextItem: SignalNewsSource = {
    ...input,
    id: `news-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    addedAt: new Date().toISOString()
  };
  const nextBundle: SignalMediaBundle = {
    ...cur,
    news: [nextItem, ...cur.news]
  };
  all[signalId] = nextBundle;
  writeAllBundles(all);
  return nextBundle;
}

export function removeSignalNewsSource(signalId: string, newsId: string): SignalMediaBundle {
  const all = readAllBundles();
  const cur = readSignalMediaBundle(signalId);
  const nextBundle: SignalMediaBundle = {
    ...cur,
    news: cur.news.filter((n) => n.id !== newsId)
  };
  all[signalId] = nextBundle;
  writeAllBundles(all);
  return nextBundle;
}

export function isPlayableAudioUrl(url: string): boolean {
  return /\.(mp3|aac|ogg|wav|m4a)(\?|$)|icecast|streamtheworld|shoutcast|radio/i.test(url);
}
