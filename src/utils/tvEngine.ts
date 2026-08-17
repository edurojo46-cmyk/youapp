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
    // Usamos el inicio del día o una época fija (ej. 2026-01-01 00:00:00 UTC) como ancla
    const anchorMs = 1767225600000; // 2026-01-01 00:00:00 UTC
    const elapsedSeconds = Math.floor(Math.max(0, nowMs - anchorMs) / 1000);
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

  // Si no es 24/7 en loop, buscamos por start_time y end_time
  const nowIso = new Date().toISOString();
  const activeIdx = programs.findIndex(p => p.start_time <= nowIso && p.end_time >= nowIso);
  
  if (activeIdx !== -1) {
    const prog = programs[activeIdx];
    const startMs = new Date(prog.start_time).getTime();
    const offsetSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
    return {
      currentProgram: prog,
      offsetSeconds,
      nextProgram: programs[activeIdx + 1] || programs[0],
      totalCycleSeconds
    };
  }

  // Fallback al primer programa
  return {
    currentProgram: programs[0],
    offsetSeconds: 0,
    nextProgram: programs[1] || programs[0],
    totalCycleSeconds
  };
};
