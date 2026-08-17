// Motor de Sincronización TV 24/7 para YouApp

export interface TVProgramItem {
  id: string;
  channel_id: string;
  video_id: string;
  start_time: string;
  end_time: string;
  videos: {
    id: string;
    title: string;
    author: string;
    duration?: string;
    thumbnail?: string;
    provider: string;
  };
  channels?: {
    id: string;
    name: string;
    category?: string;
    slug?: string;
    banner_cta?: string;
    custom_links?: Array<{ title: string; url: string; icon?: string }>;
    is_24_7?: boolean;
  };
}

export interface SyncState {
  currentProgram: TVProgramItem;
  offsetSeconds: number;
  nextProgram?: TVProgramItem;
  totalCycleSeconds: number;
}

// Convierte un string "MM:SS" o "HH:MM:SS" a segundos totales
export const parseDurationToSeconds = (durationStr?: string): number => {
  if (!durationStr || durationStr === '?') return 300; // 5 min default
  const parts = durationStr.split(':').map(Number);
  if (parts.some(isNaN)) return 300;
  
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 300;
};

/**
 * Calcula qué video está sonando en este preciso instante en un canal 24/7
 * y en qué segundo exacto para que toda la audiencia esté sincronizada.
 */
export const calculateCurrentLiveProgram = (
  programs: TVProgramItem[],
  is24_7: boolean = true
): SyncState | null => {
  if (!programs || programs.length === 0) return null;

  // Calculamos la duración de cada video en segundos
  const durations = programs.map(p => parseDurationToSeconds(p.videos?.duration));
  const totalCycleSeconds = durations.reduce((acc, curr) => acc + curr, 0);

  if (totalCycleSeconds <= 0) return null;

  const nowMs = Date.now();

  if (is24_7) {
    // Usamos el tiempo Epoch UTC global (segundos desde 1970) para sincronización matemática mundial
    const elapsedSeconds = Math.floor(nowMs / 1000);
    const cycleOffset = elapsedSeconds % totalCycleSeconds;

    let accumulated = 0;
    for (let i = 0; i < programs.length; i++) {
      const dur = durations[i];
      if (cycleOffset >= accumulated && cycleOffset < accumulated + dur) {
        const offsetSeconds = cycleOffset - accumulated;
        const nextIndex = (i + 1) % programs.length;
        return {
          currentProgram: programs[i],
          offsetSeconds,
          nextProgram: programs[nextIndex],
          totalCycleSeconds
        };
      }
      accumulated += dur;
    }
  }

  return {
    currentProgram: programs[0],
    offsetSeconds: 0,
    nextProgram: programs[1] || programs[0],
    totalCycleSeconds
  };
};

// Sincronización Global Universal para cualquier lista de videos / canal de TV

export interface GlobalSyncResult {
  activeIndex: number;
  offsetSeconds: number;
  remainingSeconds: number;
  currentVideo: any;
  nextVideo: any;
  playlistIds: string;
}

export const calculateGlobalChannelSync = (channels: any[]): GlobalSyncResult | null => {
  if (!channels || channels.length === 0) return null;

  // Extraer video IDs
  const extractId = (ch: any): string => {
    const url = ch.videoUrl || ch.id || '';
    const match = url.match(/(?:embed\/|v=|vi\/|youtu\.be\/|\/v\/|\/e\/|watch\?v=)([^#&?]*).*/);
    if (match && match[1]) return match[1];
    return url.replace('https://www.youtube.com/embed/', '').replace('yt-', '').replace('mood-', '').replace('live-', '');
  };

  const videoIds = channels.map(ch => extractId(ch)).filter(id => id.length > 5);
  const defaultDur = 300; // 5 min por video
  const durations = channels.map(ch => ch.durationSeconds || defaultDur);
  const totalCycleSeconds = durations.reduce((acc, curr) => acc + curr, 0);

  if (totalCycleSeconds <= 0) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const cycleOffset = nowSec % totalCycleSeconds;

  let accumulated = 0;
  for (let i = 0; i < channels.length; i++) {
    const dur = durations[i];
    if (cycleOffset >= accumulated && cycleOffset < accumulated + dur) {
      const offsetSeconds = cycleOffset - accumulated;
      const remainingSeconds = Math.max(1, dur - offsetSeconds);
      const nextIndex = (i + 1) % channels.length;
      
      // Ordenar playlist para que el siguiente video empiece inmediatamente después
      const remainingIds = [...videoIds.slice(i), ...videoIds.slice(0, i)];

      return {
        activeIndex: i,
        offsetSeconds,
        remainingSeconds,
        currentVideo: channels[i],
        nextVideo: channels[nextIndex],
        playlistIds: remainingIds.join(',')
      };
    }
    accumulated += dur;
  }

  return {
    activeIndex: 0,
    offsetSeconds: 0,
    remainingSeconds: defaultDur,
    currentVideo: channels[0],
    nextVideo: channels[1] || channels[0],
    playlistIds: videoIds.join(',')
  };
};

