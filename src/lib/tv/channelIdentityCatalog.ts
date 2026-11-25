import { UNIVERSAL_CATALOG } from '../universalChannels';
import { CURATED_SIGNALS_PILOT } from './curatedSignalsCatalog';
import type { CustomSignal, ScheduleBlock } from './signalTypes';

export const OFFICIAL_CHANNEL_AVATARS: Record<string, string> = {
  'justicia social tv':
    'https://yt3.googleusercontent.com/MrQnqBERTOC3jtxaAApvj6Hy4HSPeQbWiq1lq0NxiemuYmWhoyn1gj-labIhjRy2j9fS0tqBsw=s900-c-k-c0x00ffffff-no-rj',
  'canal 22':
    'https://yt3.googleusercontent.com/jHzVg6dtilEqyvBN8U67hbnJCAH6F7V1AvXq_WjV7TnP7NiLVn4oyFVtTRK4rUeH6i_AA_67ew=s900-c-k-c0x00ffffff-no-rj',
  'academia play':
    'https://yt3.googleusercontent.com/ytc/AIdro_k2bPSMlnDgdsm4BALq7trCbWOdnf7bvBLEKjHO1KRwuj4=s900-c-k-c0x00ffffff-no-rj',
  'nat geo en español':
    'https://yt3.googleusercontent.com/KN4pLsXQGXi6I45Y1DEUGEiiU17Mb-LS0RE5-zjYFqcW6z4g1ANpdBtN_rpWOus7YXJDkTMeOQ=s900-c-k-c0x00ffffff-no-rj',
  'pero eso es otra historia':
    'https://yt3.googleusercontent.com/ytc/AIdro_lE_UA0HlE9j3tCTMb6izTeLJaVXmIGSXRkzgd3510d5Gc=s900-c-k-c0x00ffffff-no-rj',
  'history latinoamérica':
    'https://yt3.googleusercontent.com/PydTjKGHQa4OX8RMKgdda8NJEdQrwr5as7EgQeIgdgaWqTbPnHgmJpVGhX_tJlsxwznXhIN2LQ=s900-c-k-c0x00ffffff-no-rj',
  'la media inglesa':
    'https://yt3.googleusercontent.com/cL9pVUDdu5t8ao3Uzul1beRUci5s6TBalnNDuSmT3qdfjyRH1nVv6Ena8ao3f4GHGjl_0WMXJA=s900-c-k-c0x00ffffff-no-rj',
  'cancha secreta':
    'https://yt3.googleusercontent.com/Ti_ekcuZq97jjEq2ohX-NWWLiT51pHlk3oP4buTybopGHr82XZXNoRNwEV0HCLrlp7bCZ-K04lY=s900-c-k-c0x00ffffff-no-rj',
  'dupla técnica':
    'https://yt3.googleusercontent.com/mrg23cs3S6G6sYvT8SZ-ZnjYB0CnoYT_oEkWT2II7xqmfrbM-jtQ4jcc82B99YqbN6JDaP0y=s900-c-k-c0x00ffffff-no-rj',
  'espn deportes':
    'https://yt3.googleusercontent.com/CDvZcyENCmGnq4guCMYZKe9eEjTTFJnWQovMDUMmwgE1AbxDactzOTHkdUxHe6kQfSmZ71Ol=s900-c-k-c0x00ffffff-no-rj',
  'tyc sports':
    'https://yt3.googleusercontent.com/VkAgCIDmeBeTHRQhvzF4Pfqu-JbLy2WWvcwBB_qVwhKp-I30toccvyxlGJlbFpcJscwCQ1HwAg=s900-c-k-c0x00ffffff-no-rj',
  'en pocas palabras – kurzgesagt':
    'https://yt3.googleusercontent.com/ytc/AIdro_nBMZVFA7nkIFmtpBgbz0LE59y9wmj9AusPTlzeUhW3DA=s900-c-k-c0x00ffffff-no-rj',
  quantumfracture:
    'https://yt3.googleusercontent.com/ytc/AIdro_lJpHTSZBbl8uWZMuctVo5UG_Xj7H_haXqIZL2yDsmFkUY=s900-c-k-c0x00ffffff-no-rj',
  'date un vlog':
    'https://yt3.googleusercontent.com/SSwjoANvuIj6vwUl8KDoeZ13WJTkqPbg2dmaVjurBwbcsWWyaBeupnNWaZk6owVkLnJ31gU1Cw=s900-c-k-c0x00ffffff-no-rj',
  'documental universo':
    'https://yt3.googleusercontent.com/1asGPc1Bn1x15C--sYiYapCk0IZaneWAjuJI1DwLPdNg825KavcZG4wg7H3Da66wQL6j1Q_WhQ=s900-c-k-c0x00ffffff-no-rj',
  'fd engineering español':
    'https://yt3.googleusercontent.com/4tFRk5NS2EmwvC-GEMkPY96IPEVo6vKM2MfOhEjhkL3Mb7Sw8cB_gfalB_tfq5nFqHoepZGpUw=s900-c-k-c0x00ffffff-no-rj'
};

export const OFFICIAL_CHANNEL_BANNERS: Record<string, string> = {
  'justicia social tv':
    'https://yt3.googleusercontent.com/Bc5380R3LS83M4ZHpnGAEqOTDftlUyxmipc8_4FkwXcYdrSWKwrl3xl8hju1gB1wyZvtKaFr=w1138-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj',
  'canal 22':
    'https://yt3.googleusercontent.com/cJlz6EYsP_DenMIHen0zvdjR588hhIe9E6DVkoKQnITirNM7eRs0oRVNFVJLTxBclf091F5t0w=w1138-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj',
  'academia play':
    'https://yt3.googleusercontent.com/_9Me3YYuFhqKrokx5ut34HT2xnrH7jMFhaOgQYyCVspmBTgt7aSdLg9Q6uV9v4rtTqxZTB1Exm8=w1138-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj',
  'nat geo en español':
    'https://yt3.googleusercontent.com/Vc4uWPMJsPdFaRDSVuzOZyHHndsi6Qd67L7aP8A3Ca_Wno3BjYmj9och15s9B3OMSE-i6ULm=w1138-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj',
  'pero eso es otra historia':
    'https://yt3.googleusercontent.com/jCoXNZmTtI4rdle4pxKrK3gPt6C_QJfNviNe_1Cqu626feeRQXzjqBKNDsRwIenh5UYS4J5gums=w1138-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj',
  'history latinoamérica':
    'https://yt3.googleusercontent.com/Nqm8Q6Cf-DDR5p2x13sQ3tQEblDqkGhn0atmJlxY0BIctNDVRUdDNz1iKgCxxP5ANNxvj3Z5zg=w1138-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj',
  'la media inglesa':
    'https://yt3.googleusercontent.com/BP_1P8YQM3BwDcrv_yFrW1EBpOIRMwaF3s53fvndFXhQP3AmjAtdgqqGFWNMVgTEKnnmF92x=w1138-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj',
  'cancha secreta':
    'https://yt3.googleusercontent.com/OaVIlj3jxZ0vIJN78-mw910wHqOOY9l2TuF_20rHYbSwKOuw5jxad9xBrbFrdzdb_LQG0obofw=w1138-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj',
  'espn deportes':
    'https://yt3.googleusercontent.com/vp7f0mR5IdAtb-qCLsfJ0lWKyLoK9ysUcM8in5jPwpbtdZdXyC1zr6skuLrL8mC89btxQD7V=w1138-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj',
  'tyc sports':
    'https://yt3.googleusercontent.com/LrJSiyY1Pw64e2VabhFQK7gXJ7WqUahvVNSvqdZxi7fdPwS2prIofgqyG5GYFBf18v7x7Ww-Og=w1138-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj',
  'en pocas palabras – kurzgesagt':
    'https://yt3.googleusercontent.com/0oC0iSHx9sCy425XU3sbXKTj-sjyDpVWDL6FnZ-Ss9LwTWK6BZAWy103bqvadlarfgaBpLnmMQ=w1138-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj',
  quantumfracture:
    'https://yt3.googleusercontent.com/aHPhotdE0ZHAs4UBmlDq77T4Ged2FKEOAh6dOYQcB6jiCZO-D86VeOGP6r8AUeILS_w5qmFFzw=w1138-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj',
  'date un vlog':
    'https://yt3.googleusercontent.com/w6jq5kG3SEAAzh6a9VAGNQiEFw_zn4dznmeCQkEBu6mNg9iA_miyh050Zaz3vD4xjy4Yb8enXg=w1138-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj',
  'documental universo':
    'https://yt3.googleusercontent.com/vNx15aVqAx0z5JqnQ5lDe8fhjT6CX5fl2FvNJVvNmqIiWGRYIdBKOW_z4rQ5QZbZvm9aeyl6=w1138-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj',
  'fd engineering español':
    'https://yt3.googleusercontent.com/40XeHI7Z-hrmWRIOIUODSphuwRIdEzZgQCpHu85PqZhLI1jdd8MoBxF9HZBgqtuYC61AI9ed1g=w1138-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj'
};

export const OFFICIAL_CHANNEL_IDS: Record<string, string> = {
  'justicia social tv': 'UCMir5GQGvJYqsUxPkbTbEhw',
  'canal 22': 'UCiPqb8qbvCBjAFHc-KMujBw',
  'espn deportes': 'UC08mnbiC4FykqpHqbEWgFcg',
  'tyc sports': 'UC72ZaBKI-Bo5fjmWEYonhJw',
  'la media inglesa': 'UC2V8vo8d3i-XQR-JcrmwwFA',
  'cancha secreta': 'UCpwsWNO68bQEu4sZmmpuPTA',
  'dupla técnica': 'UC67pzhxCtL1wjCIaI3Fogig',
  'academia play': 'UCqIWpBSq-OSUL9sCa7Spgvw',
  'nat geo en español': 'UCXVCgDuD_QCkI7gTKU7-tpg',
  'pero eso es otra historia': 'UCffvdhj3nA0s2uN3NoWDQFA',
  'history latinoamérica': 'UCVvwbez-BNlWvbxtpOx0MGQ',
  'en pocas palabras – kurzgesagt': 'UCq8ZAAsI89IoJ-fn1gYpO3g',
  quantumfracture: 'UCbdSYaPD-lr1kW27UJuk8Pw',
  'date un vlog': 'UC6lHx7hjQq0_SX0jWj2dwFg',
  'documental universo': 'UCg-NpngXIFAa6ZXvpAyLqqA',
  'fd engineering español': 'UCXaTgv15SFzrrks_sPLMdhg'
};

export interface ChannelVideoItem {
  id: string;
  videoId: string;
  title: string;
  topic: string;
  durationSec: number;
  thumbnailUrl: string;
  videoUrl: string;
  channelName: string;
  originUrl?: string;
  isLive?: boolean;
}

export interface ResolvedChannelProfile {
  slug: string;
  name: string;
  channelId?: string;
  avatarUrl?: string;
  coverUrl?: string;
  originUrl?: string;
  subtitle: string;
  videos: ChannelVideoItem[];
}

const KNOWN_EXTRA_VIDEOS: Record<string, ChannelVideoItem[]> = {
  'justicia social tv': [
    {
      id: 'jstv-rerum',
      videoId: '0cjWa3Eizqw',
      title: '¿Qué es la Rerum Novarum? · La encíclica que defendió al trabajador',
      topic: 'Documental histórico · León XIII (1891–1896)',
      durationSec: 600,
      thumbnailUrl: 'https://i.ytimg.com/vi/0cjWa3Eizqw/hqdefault.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=0cjWa3Eizqw',
      channelName: 'Justicia Social TV',
      originUrl: 'https://www.youtube.com/@justiciasocial-h7h'
    },
    {
      id: 'jstv-leonxiv',
      videoId: 'RPYfIrlMYos',
      title: 'Papa León XIV · Discursos Completos en Argentina',
      topic: 'Papa León XIV en Argentina · Cobertura especial',
      durationSec: 480,
      thumbnailUrl: 'https://i.ytimg.com/vi/RPYfIrlMYos/hqdefault.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=RPYfIrlMYos',
      channelName: 'Justicia Social TV',
      originUrl: 'https://www.youtube.com/@justiciasocial-h7h'
    },
    {
      id: 'jstv-3',
      videoId: '6PzOSG_KVXk',
      title: 'Justicia Social TV · Especial Doctrina Social y Actualidad',
      topic: 'Especial editorial · Justicia Social TV',
      durationSec: 540,
      thumbnailUrl: 'https://i.ytimg.com/vi/6PzOSG_KVXk/hqdefault.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=6PzOSG_KVXk',
      channelName: 'Justicia Social TV',
      originUrl: 'https://www.youtube.com/@justiciasocial-h7h'
    }
  ],
  'canal 22': [
    {
      id: 'c22-1',
      videoId: 'tKfcRkuxG5s',
      title: 'LA REVANCHA DEL UNO (19-11-26) · Santiago Cúneo Oficial',
      topic: 'Actualidad Política · CANAL 22 Oficial',
      durationSec: 1800,
      thumbnailUrl: 'https://i.ytimg.com/vi/tKfcRkuxG5s/hqdefault.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=tKfcRkuxG5s',
      channelName: 'CANAL 22',
      originUrl: 'https://www.youtube.com/@CANAL22WEB'
    },
    {
      id: 'c22-2',
      videoId: 'U5N-CySWnT4',
      title: 'Estamos De Vuelta (19-11-26) · CANAL 22',
      topic: 'Programa diario · CANAL 22 Oficial',
      durationSec: 1620,
      thumbnailUrl: 'https://i.ytimg.com/vi/U5N-CySWnT4/hqdefault.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=U5N-CySWnT4',
      channelName: 'CANAL 22',
      originUrl: 'https://www.youtube.com/@CANAL22WEB'
    },
    {
      id: 'c22-3',
      videoId: 'hlclGrZs28I',
      title: 'Emisión especial · CANAL 22 Web',
      topic: 'Debate y análisis · CANAL 22',
      durationSec: 1500,
      thumbnailUrl: 'https://i.ytimg.com/vi/hlclGrZs28I/hqdefault.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=hlclGrZs28I',
      channelName: 'CANAL 22',
      originUrl: 'https://www.youtube.com/@CANAL22WEB'
    },
    {
      id: 'c22-4',
      videoId: 'eWrhIioXPzg',
      title: 'Cobertura en vivo · CANAL 22 Oficial',
      topic: 'Actualidad · CANAL 22',
      durationSec: 1440,
      thumbnailUrl: 'https://i.ytimg.com/vi/eWrhIioXPzg/hqdefault.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=eWrhIioXPzg',
      channelName: 'CANAL 22',
      originUrl: 'https://www.youtube.com/@CANAL22WEB'
    }
  ]
};

export function slugifyChannelName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'canal';
}

export function resolveKnownChannelAvatar(channelName: string, explicitAvatar?: string): string | undefined {
  if (explicitAvatar && !explicitAvatar.includes('unsplash.com')) return explicitAvatar;
  const norm = channelName.trim().toLowerCase();
  if (OFFICIAL_CHANNEL_AVATARS[norm]) return OFFICIAL_CHANNEL_AVATARS[norm];
  const fromCatalog = UNIVERSAL_CATALOG.find((c) => {
    const cName = c.name.toLowerCase();
    return (cName === norm || cName.includes(norm) || norm.includes(cName)) && c.avatarUrl && !c.avatarUrl.includes('unsplash.com');
  });
  return fromCatalog?.avatarUrl;
}

export function resolveKnownChannelBanner(channelName: string, explicitCover?: string): string | undefined {
  if (explicitCover && !explicitCover.includes('unsplash.com')) return explicitCover;
  const norm = channelName.trim().toLowerCase();
  if (OFFICIAL_CHANNEL_BANNERS[norm]) return OFFICIAL_CHANNEL_BANNERS[norm];
  return undefined;
}

export function resolveKnownChannelId(channelName: string, explicitId?: string): string | undefined {
  if (explicitId && /^UC[A-Za-z0-9_-]{22}$/.test(explicitId)) return explicitId;
  const norm = channelName.trim().toLowerCase();
  if (OFFICIAL_CHANNEL_IDS[norm]) return OFFICIAL_CHANNEL_IDS[norm];
  const targetSlug = slugifyChannelName(channelName);
  for (const [k, cid] of Object.entries(OFFICIAL_CHANNEL_IDS)) {
    if (slugifyChannelName(k) === targetSlug) return cid;
  }
  return undefined;
}

function parseDurationTextToSec(text?: string): number {
  if (!text) return 600;
  const parts = String(text).trim().split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 600;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 600;
}

const LIVE_CHANNEL_VIDEOS_CACHE = new Map<string, ChannelVideoItem[]>();

export async function fetchChannelLiveVideos(
  channelId: string,
  channelName: string,
  originUrl?: string,
  limit = 30
): Promise<ChannelVideoItem[]> {
  if (!channelId || !channelId.startsWith('UC')) return [];
  const cached = LIVE_CHANNEL_VIDEOS_CACHE.get(channelId);
  if (cached && cached.length > 0) return cached.slice(0, limit);

  try {
    const res = await fetch('/api/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20260101.00.00',
            hl: 'es',
            gl: 'AR'
          }
        },
        browseId: `VLUU${channelId.slice(2)}`
      })
    });
    if (!res.ok) return [];
    const data = await res.json();
    const seen = new Set<string>();
    const items: ChannelVideoItem[] = [];

    const walk = (node: any) => {
      if (!node || typeof node !== 'object' || items.length >= 60) return;

      if (
        node.lockupViewModel &&
        typeof node.lockupViewModel.contentId === 'string' &&
        /^[A-Za-z0-9_-]{11}$/.test(node.lockupViewModel.contentId)
      ) {
        const lm = node.lockupViewModel;
        const vid: string = lm.contentId;
        const title: string = lm.metadata?.lockupMetadataViewModel?.title?.content || '';
        const imgJson = JSON.stringify(lm.contentImage || '');
        const isLive =
          /THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE|BADGE_STYLE_TYPE_LIVE_NOW|"text":"(EN VIVO|LIVE|En directo)"/i.test(
            imgJson
          );
        const durMatch = imgJson.match(/"thumbnailBadgeViewModel":\{"text":"([0-9:]+)"/);
        const durationSec = isLive ? 0 : parseDurationTextToSec(durMatch?.[1]);
        if (title && !seen.has(vid)) {
          seen.add(vid);
          items.push({
            id: `yt-${channelId}-${vid}`,
            videoId: vid,
            title,
            topic: isLive ? `EN VIVO · ${channelName}` : channelName,
            durationSec,
            thumbnailUrl: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
            videoUrl: `https://www.youtube.com/watch?v=${vid}`,
            channelName,
            originUrl,
            isLive
          });
        }
        return;
      }

      if (
        node.playlistVideoRenderer &&
        typeof node.playlistVideoRenderer.videoId === 'string' &&
        /^[A-Za-z0-9_-]{11}$/.test(node.playlistVideoRenderer.videoId)
      ) {
        const pvr = node.playlistVideoRenderer;
        const vid: string = pvr.videoId;
        const title: string = pvr.title?.runs?.[0]?.text || pvr.title?.simpleText || '';
        const pvrJson = JSON.stringify(pvr.thumbnailOverlays || pvr.badges || '');
        const isLive = /LIVE|EN VIVO|En directo/i.test(pvrJson) && !pvr.lengthSeconds;
        const durSec = isLive
          ? 0
          : Number(pvr.lengthSeconds || 0) || parseDurationTextToSec(pvr.lengthText?.simpleText);
        if (title && !seen.has(vid)) {
          seen.add(vid);
          items.push({
            id: `yt-${channelId}-${vid}`,
            videoId: vid,
            title,
            topic: isLive ? `EN VIVO · ${channelName}` : channelName,
            durationSec: durSec,
            thumbnailUrl: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
            videoUrl: `https://www.youtube.com/watch?v=${vid}`,
            channelName,
            originUrl,
            isLive
          });
        }
        return;
      }

      if (Array.isArray(node)) {
        for (const el of node) walk(el);
      } else {
        for (const k of Object.keys(node)) walk(node[k]);
      }
    };

    walk(data);
    if (items.length > 0) {
      LIVE_CHANNEL_VIDEOS_CACHE.set(channelId, items);
    }
    return items.slice(0, limit);
  } catch {
    return [];
  }
}

export interface ChannelGridSnapshot {
  liveVideo: ChannelVideoItem | null;
  latestVideos: ChannelVideoItem[];
}

export async function fetchChannelGridSnapshot(
  channelId: string,
  channelName: string,
  originUrl?: string
): Promise<ChannelGridSnapshot> {
  const list = await fetchChannelLiveVideos(channelId, channelName, originUrl, 12);
  const liveVideo = list.find((v) => v.isLive) || null;
  const latestVideos = list.filter((v) => !v.isLive).slice(0, 2);
  return { liveVideo, latestVideos };
}

export function resolveChannelProfile(
  slugOrName: string,
  options?: {
    activeSignal?: CustomSignal | null;
    savedSignalsById?: Record<string, CustomSignal>;
    routeState?: {
      channelName?: string;
      originUrl?: string;
      avatarUrl?: string;
      coverUrl?: string;
      blocks?: ScheduleBlock[];
    } | null;
  }
): ResolvedChannelProfile {
  const targetSlug = slugifyChannelName(decodeURIComponent(slugOrName || ''));
  const routeState = options?.routeState || null;

  let resolvedName = routeState?.channelName || '';
  let resolvedOriginUrl = routeState?.originUrl;
  let resolvedAvatar = routeState?.avatarUrl;
  let resolvedCover = routeState?.coverUrl;
  let subtitle = 'Canal disponible en YOUAPP';

  const videosByVideoId = new Map<string, ChannelVideoItem>();
  const addVideo = (v: ChannelVideoItem) => {
    if (!v.videoId || videosByVideoId.has(v.videoId)) return;
    videosByVideoId.set(v.videoId, v);
  };

  // 1. Videos passed from navigation state
  if (routeState?.blocks?.length) {
    for (const blk of routeState.blocks) {
      const vid = blk.contentItem.providerId || blk.contentItem.id;
      const chName = blk.contentItem.channelTitle || (blk.contentItem as any).channelName || resolvedName;
      if (!resolvedName && chName) resolvedName = chName;
      if (!resolvedOriginUrl && (blk.contentItem as any).originUrl) {
        resolvedOriginUrl = (blk.contentItem as any).originUrl;
      }
      addVideo({
        id: blk.id,
        videoId: vid,
        title: blk.contentItem.title,
        topic: blk.topic || chName,
        durationSec: blk.durationSec || 600,
        thumbnailUrl:
          blk.contentItem.thumbnail ||
          (blk.contentItem as any).thumbnailUrl ||
          `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        videoUrl: blk.contentItem.videoUrl || `https://www.youtube.com/watch?v=${vid}`,
        channelName: chName || resolvedName,
        originUrl: (blk.contentItem as any).originUrl || resolvedOriginUrl
      });
    }
  }

  // 2. Scan activeSignal + savedSignalsById
  const allSignals: CustomSignal[] = [];
  if (options?.activeSignal) allSignals.push(options.activeSignal);
  if (options?.savedSignalsById) {
    for (const sig of Object.values(options.savedSignalsById)) {
      if (sig && !allSignals.some((s) => s.id === sig.id)) allSignals.push(sig);
    }
  }
  for (const sig of allSignals) {
    for (const blk of sig.schedule || []) {
      const chName = blk.contentItem.channelTitle || (blk.contentItem as any).channelName || '';
      if (!chName) continue;
      if (slugifyChannelName(chName) !== targetSlug) continue;
      if (!resolvedName) resolvedName = chName;
      if (!resolvedOriginUrl && (blk.contentItem as any).originUrl) {
        resolvedOriginUrl = (blk.contentItem as any).originUrl;
      }
      const vid = blk.contentItem.providerId || blk.contentItem.id;
      addVideo({
        id: blk.id,
        videoId: vid,
        title: blk.contentItem.title,
        topic: blk.topic || chName,
        durationSec: blk.durationSec || 600,
        thumbnailUrl:
          blk.contentItem.thumbnail ||
          (blk.contentItem as any).thumbnailUrl ||
          `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        videoUrl: blk.contentItem.videoUrl || `https://www.youtube.com/watch?v=${vid}`,
        channelName: chName,
        originUrl: (blk.contentItem as any).originUrl || resolvedOriginUrl
      });
    }
  }

  // 3. Scan curated signals pilot
  for (const curated of CURATED_SIGNALS_PILOT) {
    for (const ch of curated.channels) {
      if (slugifyChannelName(ch.channelName) !== targetSlug) continue;
      if (!resolvedName) resolvedName = ch.channelName;
      if (!resolvedOriginUrl) resolvedOriginUrl = ch.originUrl;
      subtitle = curated.curatorRole;
      addVideo({
        id: `cur-${ch.id}`,
        videoId: ch.videoId,
        title: ch.videoTitle,
        topic: ch.topic,
        durationSec: ch.durationSec,
        thumbnailUrl: `https://i.ytimg.com/vi/${ch.videoId}/hqdefault.jpg`,
        videoUrl: `https://www.youtube.com/watch?v=${ch.videoId}`,
        channelName: ch.channelName,
        originUrl: ch.originUrl
      });
    }
  }

  // 4. Add known extra verified videos for this channel
  const normKey = (resolvedName || '').trim().toLowerCase();
  const extraKey =
    Object.keys(KNOWN_EXTRA_VIDEOS).find((k) => k === normKey || slugifyChannelName(k) === targetSlug) || '';
  if (extraKey) {
    for (const v of KNOWN_EXTRA_VIDEOS[extraKey]) {
      if (!resolvedName) resolvedName = v.channelName;
      if (!resolvedOriginUrl && v.originUrl) resolvedOriginUrl = v.originUrl;
      addVideo(v);
    }
  }

  if (!resolvedName) {
    resolvedName = targetSlug
      .split('-')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
      .join(' ');
  }

  resolvedAvatar = resolveKnownChannelAvatar(resolvedName, resolvedAvatar);
  resolvedCover = resolveKnownChannelBanner(resolvedName, resolvedCover);
  const resolvedChannelId = resolveKnownChannelId(resolvedName);

  return {
    slug: targetSlug,
    name: resolvedName,
    channelId: resolvedChannelId,
    avatarUrl: resolvedAvatar,
    coverUrl: resolvedCover,
    originUrl: resolvedOriginUrl,
    subtitle,
    videos: Array.from(videosByVideoId.values())
  };
}
