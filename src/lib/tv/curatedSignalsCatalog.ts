import type { CustomSignal, ScheduleBlock } from './signalTypes';
import { logAudienceEvent } from '../player/telemetry/playerEvents';

export interface CuratedChannelEntry {
  id: string;
  channelName: string;
  originPlatform: 'YOUTUBE';
  originUrl: string;
  videoId: string;
  videoTitle: string;
  topic: string;
  durationSec: number;
  role: 'opening' | 'context' | 'deep_dive' | 'explainer' | 'close';
}

export interface CuratedSignalDefinition {
  id: string;
  slug: 'historia' | 'futbol' | 'ciencia';
  title: string;
  subtitle: string;
  curatorRole: string;
  curatorNote: string;
  tags: string[];
  accentColor: string;
  coverVideoId: string;
  channels: CuratedChannelEntry[];
}

export const CURATED_SIGNALS_PILOT: CuratedSignalDefinition[] = [
  {
    id: 'curated-historia-viva',
    slug: 'historia',
    title: 'El Mundo de la Historia',
    subtitle: 'Una selección de canales de historia, arqueología, cultura y civilizaciones.',
    curatorRole: 'Curaduría temática · Historia y Civilizaciones',
    curatorNote: 'Reúne divulgadores rigurosos y documentales históricos sin clickbait.',
    tags: ['Historia', 'Arqueología', 'Cultura'],
    accentColor: '#b45309',
    coverVideoId: 'UF_yHrFP1Ls',
    channels: [
      {
        id: 'hist-academiaplay',
        channelName: 'Academia Play',
        originPlatform: 'YOUTUBE',
        originUrl: 'https://www.youtube.com/@academiaplay',
        videoId: 'UF_yHrFP1Ls',
        videoTitle: 'El Imperio Romano en 10 minutos',
        topic: 'Civilizaciones antiguas · Síntesis visual',
        durationSec: 615,
        role: 'opening'
      },
      {
        id: 'hist-justiciasocial',
        channelName: 'Justicia Social TV',
        originPlatform: 'YOUTUBE',
        originUrl: 'https://www.youtube.com/@justiciasocial-h7h',
        videoId: '0cjWa3Eizqw',
        videoTitle: '¿Qué es la Rerum Novarum? · Historia social del siglo XIX',
        topic: 'Historia contemporánea · Trabajo y derechos',
        durationSec: 600,
        role: 'context'
      },
      {
        id: 'hist-natgeo',
        channelName: 'Nat Geo en Español',
        originPlatform: 'YOUTUBE',
        originUrl: 'https://www.youtube.com/@NationalGeographicEspanol',
        videoId: '4TopChjtmvM',
        videoTitle: 'Ascenso del Imperio Romano | Drenar los Océanos',
        topic: 'Arqueología submarina · Mediterráneo',
        durationSec: 840,
        role: 'explainer'
      },
      {
        id: 'hist-peroeso',
        channelName: 'Pero eso es otra Historia',
        originPlatform: 'YOUTUBE',
        originUrl: 'https://www.youtube.com/@PeroesoesotraHistoria',
        videoId: 'UtTMIPSc7kE',
        videoTitle: 'Antigua Roma: Monarquía, República e Imperio Romano',
        topic: 'Cronología completa · Antigüedad clásica',
        durationSec: 1860,
        role: 'deep_dive'
      },
      {
        id: 'hist-historyla',
        channelName: 'History Latinoamérica',
        originPlatform: 'YOUTUBE',
        originUrl: 'https://www.youtube.com/@HistoryLA',
        videoId: 'mX_W48v6Kn8',
        videoTitle: 'Secretos de la construcción romana · Inventos Legendarios',
        topic: 'Ingeniería antigua · Monumentos',
        durationSec: 2520,
        role: 'close'
      }
    ]
  },
  {
    id: 'curated-futbol-viva',
    slug: 'futbol',
    title: 'Pizarrón y Épica del Fútbol',
    subtitle: 'Análisis táctico, historias de los Mundiales y grandes documentales deportivos.',
    curatorRole: 'Curaduría temática · Fútbol, Táctica e Historia',
    curatorNote: 'Cinco miradas complementarias para entender el juego más allá del resultado.',
    tags: ['Fútbol', 'Táctica', 'Documentales'],
    accentColor: '#15803d',
    coverVideoId: 'ooj-O2otF7I',
    channels: [
      {
        id: 'fut-mediainglesa',
        channelName: 'La Media Inglesa',
        originPlatform: 'YOUTUBE',
        originUrl: 'https://www.youtube.com/@Lamediainglesa',
        videoId: 'ooj-O2otF7I',
        videoTitle: 'Este fue el primer partido internacional de la historia · Historias del Mundial',
        topic: 'Orígenes del fútbol · Crónica histórica',
        durationSec: 720,
        role: 'opening'
      },
      {
        id: 'fut-canchasecreta',
        channelName: 'Cancha Secreta',
        originPlatform: 'YOUTUBE',
        originUrl: 'https://www.youtube.com/@CANCHASECRETA',
        videoId: 'joFuLi_uomQ',
        videoTitle: 'Julián Álvarez y el legado de la Selección campeona',
        topic: 'Protagonistas · Cultura de equipo',
        durationSec: 540,
        role: 'context'
      },
      {
        id: 'fut-duplatecnica',
        channelName: 'Dupla Técnica',
        originPlatform: 'YOUTUBE',
        originUrl: 'https://www.youtube.com/@DuplaT%C3%A9cnica',
        videoId: 'S2Bn1WgrcDE',
        videoTitle: 'La era post Messi: ¿con qué esquema jugará la Selección de Scaloni?',
        topic: 'Pizarrón táctico · Sistemas de juego',
        durationSec: 810,
        role: 'explainer'
      },
      {
        id: 'fut-espn',
        channelName: 'ESPN Deportes',
        originPlatform: 'YOUTUBE',
        originUrl: 'https://www.youtube.com/@espndeportes',
        videoId: 'Sq-b_L6e6v0',
        videoTitle: 'Messi y la gran historia que cambió el fútbol mundial | SC Reportajes',
        topic: 'Reportaje especial · Épica mundialista',
        durationSec: 1560,
        role: 'deep_dive'
      },
      {
        id: 'fut-tyc',
        channelName: 'TyC Sports',
        originPlatform: 'YOUTUBE',
        originUrl: 'https://www.youtube.com/@tycsports',
        videoId: '74Qm5kcHc3E',
        videoTitle: 'Para Siempre · El documental de Argentina Campeona del Mundo',
        topic: 'Documental completo · Qatar 2022',
        durationSec: 2700,
        role: 'close'
      }
    ]
  },
  {
    id: 'curated-ciencia-viva',
    slug: 'ciencia',
    title: 'Fronteras de la Ciencia',
    subtitle: 'Los mejores divulgadores en español sobre física, cosmos, agujeros negros y futuro.',
    curatorRole: 'Curaduría temática · Ciencia, Física y Cosmos',
    curatorNote: 'Explicaciones claras y visuales validadas por divulgadores científicos.',
    tags: ['Ciencia', 'Cosmos', 'Física'],
    accentColor: '#1d4ed8',
    coverVideoId: 'TFhRXnE2xck',
    channels: [
      {
        id: 'cie-kurzgesagt',
        channelName: 'En Pocas Palabras – Kurzgesagt',
        originPlatform: 'YOUTUBE',
        originUrl: 'https://www.youtube.com/@kurzgesagt_es',
        videoId: 'TFhRXnE2xck',
        videoTitle: '¿Qué pasa si nos caemos en un agujero negro?',
        topic: 'Astrofísica animada · Horizonte de sucesos',
        durationSec: 690,
        role: 'opening'
      },
      {
        id: 'cie-quantum',
        channelName: 'QuantumFracture',
        originPlatform: 'YOUTUBE',
        originUrl: 'https://www.youtube.com/@QuantumFracture',
        videoId: 'xQb1QDc0FAs',
        videoTitle: '¡La Voyager cumple un hito! ¡1 día-luz de distancia!',
        topic: 'Exploración espacial · Física moderna',
        durationSec: 630,
        role: 'context'
      },
      {
        id: 'cie-dateunvlog',
        channelName: 'Date un Vlog',
        originPlatform: 'YOUTUBE',
        originUrl: 'https://www.youtube.com/@dateunvlog',
        videoId: 'cs2kyXC-zDw',
        videoTitle: 'Hoy sí que vas a entender los agujeros negros',
        topic: 'Relatividad general · Divulgación clara',
        durationSec: 870,
        role: 'explainer'
      },
      {
        id: 'cie-docuniverso',
        channelName: 'Documental Universo',
        originPlatform: 'YOUTUBE',
        originUrl: 'https://www.youtube.com/@DocumentalUniverso',
        videoId: 'AZ0c0onPHWk',
        videoTitle: '¿Qué hay dentro de un agujero negro? | Documental Universo',
        topic: 'Cosmología profunda · Singularidades',
        durationSec: 1680,
        role: 'deep_dive'
      },
      {
        id: 'cie-fdeng',
        channelName: 'FD Engineering Español',
        originPlatform: 'YOUTUBE',
        originUrl: 'https://www.youtube.com/@FDEngineeringEspa%C3%B1ol',
        videoId: 'eAinmbHyRBY',
        videoTitle: 'En busca de agujeros negros y secretos del universo',
        topic: 'Ingeniería aeroespacial · Telescopios',
        durationSec: 2400,
        role: 'close'
      }
    ]
  }
];

export function findCuratedSignalById(signalId?: string | null): CuratedSignalDefinition | null {
  if (!signalId) return null;
  const norm = signalId.trim().toLowerCase();
  return (
    CURATED_SIGNALS_PILOT.find(
      (s) => s.id.toLowerCase() === norm || s.slug.toLowerCase() === norm
    ) || null
  );
}

export function channelEntryToScheduleBlock(
  entry: CuratedChannelEntry,
  position: number,
  startOffsetSec: number
): ScheduleBlock {
  return {
    id: `blk-${entry.id}`,
    position,
    startOffsetSec,
    durationSec: entry.durationSec,
    topic: entry.topic,
    role: entry.role,
    generationReason: `Seleccionado por curaduría temática · Canal original: ${entry.channelName}`,
    contentItem: {
      id: entry.videoId,
      providerId: entry.videoId,
      type: 'video',
      provider: 'youtube',
      title: entry.videoTitle,
      thumbnailUrl: `https://i.ytimg.com/vi/${entry.videoId}/hqdefault.jpg`,
      thumbnail: `https://i.ytimg.com/vi/${entry.videoId}/hqdefault.jpg`,
      videoUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
      channelName: entry.channelName,
      channelTitle: entry.channelName,
      channelId: entry.id,
      originUrl: entry.originUrl,
      isLive: false,
      isVerified: true
    } as any
  };
}

export function buildCustomSignalFromCurated(
  curated: CuratedSignalDefinition,
  options?: {
    selectedChannelIds?: string[];
    quick15Min?: boolean;
  }
): CustomSignal & { seedVersion: number; curatorRole: string; isCuratedPilot: boolean } {
  let chosen = curated.channels;
  if (options?.selectedChannelIds && options.selectedChannelIds.length > 0) {
    const allowed = new Set(options.selectedChannelIds);
    const filtered = curated.channels.filter((c) => allowed.has(c.id));
    if (filtered.length > 0) chosen = filtered;
  }

  if (options?.quick15Min) {
    const under15 = chosen.filter((c) => c.durationSec <= 900);
    if (under15.length > 0) chosen = under15;
  }

  let offset = 0;
  const schedule: ScheduleBlock[] = chosen.map((entry, idx) => {
    const blk = channelEntryToScheduleBlock(entry, idx, offset);
    offset += entry.durationSec;
    return blk;
  });

  return {
    id: curated.id,
    name: curated.title,
    seedVersion: 2,
    curatorRole: curated.curatorRole,
    isCuratedPilot: true,
    prompt: curated.subtitle,
    mainTopic: curated.tags.join(' · '),
    visibility: 'public',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    schedule
  } as any;
}

export function mergeCuratedIntoPersonalSignal(
  existingSignal: CustomSignal | null,
  curated: CuratedSignalDefinition,
  selectedChannelIds?: string[]
): { updatedSignal: CustomSignal; addedCount: number } {
  const chosen =
    selectedChannelIds && selectedChannelIds.length > 0
      ? curated.channels.filter((c) => selectedChannelIds.includes(c.id))
      : curated.channels;

  const baseSchedule: ScheduleBlock[] = existingSignal?.schedule ? [...existingSignal.schedule] : [];
  const existingVideoIds = new Set(
    baseSchedule.map((b) => b.contentItem.providerId || b.contentItem.id)
  );

  let addedCount = 0;
  let offset = baseSchedule.reduce((acc, b) => acc + Math.max(1, b.durationSec || 60), 0);

  for (const entry of chosen) {
    if (existingVideoIds.has(entry.videoId)) continue;
    existingVideoIds.add(entry.videoId);
    baseSchedule.push(channelEntryToScheduleBlock(entry, baseSchedule.length, offset));
    offset += entry.durationSec;
    addedCount += 1;
  }

  const updatedSignal: CustomSignal = {
    id:
      existingSignal && !existingSignal.id.startsWith('curated-')
        ? existingSignal.id
        : 'mi-senal-personal-curada',
    name:
      existingSignal && !existingSignal.id.startsWith('curated-')
        ? existingSignal.name
        : 'Mi Señal Personal',
    prompt: existingSignal?.prompt || 'Mi selección personal de canales confiables',
    visibility: existingSignal?.visibility || 'public',
    created_at: existingSignal?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    schedule: baseSchedule,
    ...(existingSignal ? { seedVersion: 2 } : { seedVersion: 2 })
  } as any;

  return { updatedSignal, addedCount };
}

// ─── Registro local auditable del Experimento Piloto (sin datos falsos) ──────

const PILOT_STORAGE_KEY = 'youapp_curated_signals_pilot_v1';

export interface CuratedPilotState {
  followedSignalIds: string[];
  discoveredChannels: string[];
  activeDays: string[];
  signalOpensCount: number;
  quick15UsesCount: number;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function readCuratedPilotState(): CuratedPilotState {
  const fallback: CuratedPilotState = {
    followedSignalIds: [],
    discoveredChannels: [],
    activeDays: [todayIsoDate()],
    signalOpensCount: 0,
    quick15UsesCount: 0
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(PILOT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const days = new Set<string>(Array.isArray(parsed.activeDays) ? parsed.activeDays : []);
    days.add(todayIsoDate());
    return {
      followedSignalIds: Array.isArray(parsed.followedSignalIds) ? parsed.followedSignalIds : [],
      discoveredChannels: Array.isArray(parsed.discoveredChannels) ? parsed.discoveredChannels : [],
      activeDays: Array.from(days),
      signalOpensCount: Number(parsed.signalOpensCount || 0),
      quick15UsesCount: Number(parsed.quick15UsesCount || 0)
    };
  } catch {
    return fallback;
  }
}

function writeCuratedPilotState(next: CuratedPilotState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PILOT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
}

export function toggleFollowCuratedSignal(signalId: string, forceFollow?: boolean): CuratedPilotState {
  const cur = readCuratedPilotState();
  const exists = cur.followedSignalIds.includes(signalId);
  const shouldFollow = typeof forceFollow === 'boolean' ? forceFollow : !exists;
  const followedSignalIds = shouldFollow
    ? Array.from(new Set([...cur.followedSignalIds, signalId]))
    : cur.followedSignalIds.filter((id) => id !== signalId);

  const sig = findCuratedSignalById(signalId);
  const discovered = new Set(cur.discoveredChannels);
  if (shouldFollow && sig) {
    sig.channels.forEach((c) => discovered.add(c.originUrl));
  }

  const next: CuratedPilotState = {
    ...cur,
    followedSignalIds,
    discoveredChannels: Array.from(discovered)
  };
  writeCuratedPilotState(next);
  logAudienceEvent('curated_signal_follow_toggled' as any, { signalId, followed: shouldFollow });
  return next;
}

export function recordCuratedSignalSession(
  signalId: string,
  channelUrls: string[],
  usedQuick15 = false
): CuratedPilotState {
  const cur = readCuratedPilotState();
  const discovered = new Set(cur.discoveredChannels);
  channelUrls.forEach((u) => {
    if (u) discovered.add(u);
  });
  const next: CuratedPilotState = {
    ...cur,
    discoveredChannels: Array.from(discovered),
    signalOpensCount: cur.signalOpensCount + 1,
    quick15UsesCount: cur.quick15UsesCount + (usedQuick15 ? 1 : 0)
  };
  writeCuratedPilotState(next);
  logAudienceEvent('curated_signal_opened' as any, {
    signalId,
    channelsCount: channelUrls.length,
    usedQuick15
  });
  return next;
}
