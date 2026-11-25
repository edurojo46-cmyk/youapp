// ============================================================================
// MiTV V1 — Televisor Personal Programado por URL (0 Cuota API)
// - Permite armar grillas/canales personales pegando URLs (YouTube, Vimeo,
//   Dailymotion o enlaces directos MP4/WebM).
// - Resuelve título y miniatura mediante oEmbed público (0 cuota API).
// - Guarda punteros en localStorage y sincroniza con Supabase user_metadata.
// ============================================================================

import { supabase } from '../supabase';

const STORAGE_KEY = 'youapp_mitv_channels_v1';

export type MiTvProvider =
  | 'youtube'
  | 'youtube_live'
  | 'vimeo'
  | 'dailymotion'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'twitch'
  | 'x'
  | 'direct';
export type MiTvSlot = 'Ahora' | 'Mañana' | 'Tarde' | 'Noche' | 'En vivo';
export type MiTvLiveCategory = 'TV de Aire' | 'Cable & Noticias' | 'Internacional' | 'Streams en Vivo';

export const MITV_SLOTS: MiTvSlot[] = ['Ahora', 'Mañana', 'Tarde', 'Noche', 'En vivo'];

export const OFFICIAL_LIVE_TV_CHANNEL_ID = 'mitv-official-live-tv';

export interface MiTvItem {
  id: string;
  provider: MiTvProvider;
  providerId: string;
  liveVideoId?: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  sourceUrl: string;
  slot: MiTvSlot;
  liveCategory?: MiTvLiveCategory;
  watched?: boolean;
  addedAt: string;
}

/** Grilla Oficial de TV en Vivo (IDs oficiales verificados + liveVideoId real · 0 cuota API) */
export const OFFICIAL_LIVE_TV_ITEMS: MiTvItem[] = [
  // ── CABLE & NOTICIAS 24/7 (EN VIVO AHORA) ────────────────────────────────
  {
    id: 'live-tn',
    provider: 'youtube_live',
    providerId: 'UCj6PcyLvpnIRT_2W_mwa9Aw',
    liveVideoId: 'cb12KmMMDJA',
    title: 'TN · Todo Noticias 24/7',
    author: 'Todo Noticias',
    thumbnailUrl: 'https://i.ytimg.com/vi/cb12KmMMDJA/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@todonoticias/live',
    slot: 'En vivo',
    liveCategory: 'Cable & Noticias',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-c5n',
    provider: 'youtube_live',
    providerId: 'UCFgk2Q2mVO1BklRQhSv6p0w',
    liveVideoId: 'rZtTUCxpPuI',
    title: 'C5N · Noticias 24/7',
    author: 'C5N Oficial',
    thumbnailUrl: 'https://i.ytimg.com/vi/rZtTUCxpPuI/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@c5n/live',
    slot: 'En vivo',
    liveCategory: 'Cable & Noticias',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-lnmas',
    provider: 'youtube_live',
    providerId: 'UCba3hpU7EFBSk817y9qZkiA',
    liveVideoId: 'FEWZjXJ7M0c',
    title: 'LN+ · La Nación+ En Vivo',
    author: 'LA NACION',
    thumbnailUrl: 'https://i.ytimg.com/vi/FEWZjXJ7M0c/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@lanacion/live',
    slot: 'En vivo',
    liveCategory: 'Cable & Noticias',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-a24',
    provider: 'youtube_live',
    providerId: 'UCR9120YBAqMfntqgRTKmkjQ',
    liveVideoId: 'ArKbAx1K-2U',
    title: 'A24 · Noticias 24/7',
    author: 'A24com',
    thumbnailUrl: 'https://i.ytimg.com/vi/ArKbAx1K-2U/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@A24com/live',
    slot: 'En vivo',
    liveCategory: 'Cable & Noticias',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-cronica',
    provider: 'youtube_live',
    providerId: 'UCT7KFGv6s2a-rh2Jq8ZdM1g',
    liveVideoId: 'hw4uHyct4vg',
    title: 'Crónica TV · En Vivo 24/7',
    author: 'Crónica TV',
    thumbnailUrl: 'https://i.ytimg.com/vi/hw4uHyct4vg/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@CronicaTV/live',
    slot: 'En vivo',
    liveCategory: 'Cable & Noticias',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-canal26',
    provider: 'youtube_live',
    providerId: 'UCrpMfcQNog595v5gAS-oUsQ',
    liveVideoId: '_YxIXvfNRNQ',
    title: 'Canal 26 · Noticias 24/7',
    author: 'Canal 26',
    thumbnailUrl: 'https://i.ytimg.com/vi/_YxIXvfNRNQ/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@canal26/live',
    slot: 'En vivo',
    liveCategory: 'Cable & Noticias',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-telefe-noticias',
    provider: 'youtube_live',
    providerId: 'UChxGASjdNEYHhVKpl667Huw',
    liveVideoId: 'XhAYcYpPzTc',
    title: 'Telefe Noticias · En Vivo',
    author: 'Telefe Noticias',
    thumbnailUrl: 'https://i.ytimg.com/vi/XhAYcYpPzTc/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@telefenoticias/live',
    slot: 'En vivo',
    liveCategory: 'TV de Aire',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-dw',
    provider: 'youtube_live',
    providerId: 'UCT4Jg8h03dD0iN3Pb5L0PMA',
    liveVideoId: 'yZh3xsFqCt8',
    title: 'DW Español · Noticias 24/7',
    author: 'DW Español',
    thumbnailUrl: 'https://i.ytimg.com/vi/yZh3xsFqCt8/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@dwespanol/live',
    slot: 'En vivo',
    liveCategory: 'Internacional',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-france24',
    provider: 'youtube_live',
    providerId: 'UCUdOoVWuWmgo1wByzcsyKDQ',
    liveVideoId: 'zTv0hCakAhg',
    title: 'France 24 Español · En Vivo',
    author: 'FRANCE 24 Español',
    thumbnailUrl: 'https://i.ytimg.com/vi/zTv0hCakAhg/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@france24_es/live',
    slot: 'En vivo',
    liveCategory: 'Internacional',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-radiomitre',
    provider: 'youtube_live',
    providerId: 'UCYvINPByAdCcpA0sWrF3I_w',
    liveVideoId: '4kHIIA_Dp3Y',
    title: 'Radio Mitre HD · AM 790 En Vivo',
    author: 'Radio Mitre',
    thumbnailUrl: 'https://i.ytimg.com/vi/4kHIIA_Dp3Y/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@radiomitre/live',
    slot: 'En vivo',
    liveCategory: 'Cable & Noticias',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-radiolared',
    provider: 'youtube_live',
    providerId: 'UCs1U5lRXvUJHn0CgXI6oXAw',
    liveVideoId: '1oDRHCaKh4U',
    title: 'Radio La Red HD · AM 910 En Vivo',
    author: 'Radio La Red',
    thumbnailUrl: 'https://i.ytimg.com/vi/1oDRHCaKh4U/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@radiolared/live',
    slot: 'En vivo',
    liveCategory: 'Cable & Noticias',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-cnnee',
    provider: 'youtube_live',
    providerId: 'UC_lEiu6917IJz03TnntWUaQ',
    liveVideoId: 'Qr61waJ6AZg',
    title: 'CNN en Español · En Vivo 24/7',
    author: 'CNN en Español',
    thumbnailUrl: 'https://i.ytimg.com/vi/Qr61waJ6AZg/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@CNNee/live',
    slot: 'En vivo',
    liveCategory: 'Internacional',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-euronews-es',
    provider: 'youtube_live',
    providerId: 'UCyoGb3SMlTlB8CLGVH4c8Rw',
    liveVideoId: 'O9mOtdZ-nSk',
    title: 'Euronews en Español · 24/7',
    author: 'euronews (en español)',
    thumbnailUrl: 'https://i.ytimg.com/vi/O9mOtdZ-nSk/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@euronewses/live',
    slot: 'En vivo',
    liveCategory: 'Internacional',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-rtve24h',
    provider: 'youtube_live',
    providerId: 'UC7QZIf0dta-XPXsp9Hv4dTw',
    liveVideoId: 'b4tE5aKhtlg',
    title: 'RTVE · Canal 24 Horas España',
    author: 'RTVE Noticias',
    thumbnailUrl: 'https://i.ytimg.com/vi/b4tE5aKhtlg/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@rtvenoticias/live',
    slot: 'En vivo',
    liveCategory: 'Internacional',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-ntn24',
    provider: 'youtube_live',
    providerId: 'UCEJs1fTF3KszRJGxJY14VrA',
    liveVideoId: 'jwPDuxta-p0',
    title: 'NTN24 · Noticias Latinoamérica',
    author: 'NTN24',
    thumbnailUrl: 'https://i.ytimg.com/vi/jwPDuxta-p0/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@NTN24/live',
    slot: 'En vivo',
    liveCategory: 'Internacional',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-caracol',
    provider: 'youtube_live',
    providerId: 'UC2Xq2PK-got3Rtz9ZJ32hLQ',
    liveVideoId: 'MYZi0THS3B0',
    title: 'Noticias Caracol · Colombia 24/7',
    author: 'Noticias Caracol',
    thumbnailUrl: 'https://i.ytimg.com/vi/MYZi0THS3B0/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@NoticiasCaracol/live',
    slot: 'En vivo',
    liveCategory: 'Internacional',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-forotv',
    provider: 'youtube_live',
    providerId: 'UCUsm-fannqOY02PNN67C0KA',
    liveVideoId: 'p2AzyIEuFak',
    title: 'N+ FOROtv · México 24/7',
    author: 'NMás',
    thumbnailUrl: 'https://i.ytimg.com/vi/p2AzyIEuFak/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@nmas/live',
    slot: 'En vivo',
    liveCategory: 'Internacional',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-milenio',
    provider: 'youtube_live',
    providerId: 'UCFxHplbcoJK9m70c4VyTIxg',
    liveVideoId: 'oPy8a-TCjzA',
    title: 'Milenio Televisión · 24/7',
    author: 'MILENIO',
    thumbnailUrl: 'https://i.ytimg.com/vi/oPy8a-TCjzA/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@MILENIO/live',
    slot: 'En vivo',
    liveCategory: 'Internacional',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-bloomberg',
    provider: 'youtube_live',
    providerId: 'UCIALMKvObZNtJ6AmdCLP7Lg',
    liveVideoId: 'emyNoh1bWz0',
    title: 'Bloomberg Television · Mercados 24/7',
    author: 'Bloomberg Television',
    thumbnailUrl: 'https://i.ytimg.com/vi/emyNoh1bWz0/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@markets/live',
    slot: 'En vivo',
    liveCategory: 'Internacional',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-abcnews',
    provider: 'youtube_live',
    providerId: 'UCBi2mrWuNuyYy4gbM6fU18Q',
    liveVideoId: 'QbWsfPZrRpA',
    title: 'ABC News Live · 24/7',
    author: 'ABC News',
    thumbnailUrl: 'https://i.ytimg.com/vi/QbWsfPZrRpA/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@ABCNews/live',
    slot: 'En vivo',
    liveCategory: 'Internacional',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-nbcnews',
    provider: 'youtube_live',
    providerId: 'UCeY0bbntWzzVIaj2z3QigXg',
    liveVideoId: 'pJZBppLlwJo',
    title: 'NBC News NOW · 24/7',
    author: 'NBC News',
    thumbnailUrl: 'https://i.ytimg.com/vi/pJZBppLlwJo/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@NBCNews/live',
    slot: 'En vivo',
    liveCategory: 'Internacional',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-skynews',
    provider: 'youtube_live',
    providerId: 'UCoMdktPbSTixAyNGwb-UYkQ',
    liveVideoId: 'tP8etKB7IIk',
    title: 'Sky News · Reino Unido 24/7',
    author: 'Sky News',
    thumbnailUrl: 'https://i.ytimg.com/vi/tP8etKB7IIk/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@SkyNews/live',
    slot: 'En vivo',
    liveCategory: 'Internacional',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-aljazeera',
    provider: 'youtube_live',
    providerId: 'UCNye-wNBqNL5ZzHSJj3l8Bg',
    liveVideoId: 'gCNeDWCI0vo',
    title: 'Al Jazeera English · 24/7',
    author: 'Al Jazeera English',
    thumbnailUrl: 'https://i.ytimg.com/vi/gCNeDWCI0vo/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@aljazeeraenglish/live',
    slot: 'En vivo',
    liveCategory: 'Internacional',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-nasa',
    provider: 'youtube_live',
    providerId: 'UCLA_DiR1FfKNvjuUpBHmylQ',
    liveVideoId: 'ROboUHfPUrU',
    title: 'NASA Live · Espacio 24/7',
    author: 'NASA',
    thumbnailUrl: 'https://i.ytimg.com/vi/ROboUHfPUrU/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@NASA/live',
    slot: 'En vivo',
    liveCategory: 'Internacional',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-luzu',
    provider: 'youtube_live',
    providerId: 'UCTHaNTsP7hsVgBxARZTuajw',
    liveVideoId: 'QSLiLY31i04',
    title: 'LUZU TV · En Vivo',
    author: 'LUZU TV',
    thumbnailUrl: 'https://i.ytimg.com/vi/QSLiLY31i04/hqdefault.jpg',
    sourceUrl: 'https://www.youtube.com/@luzutv/live',
    slot: 'En vivo',
    liveCategory: 'Streams en Vivo',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-eldestape',
    provider: 'youtube_live',
    providerId: 'UC5wAqJ9NF0fpGH9dVf3h6HA',
    title: 'El Destape TV · En Vivo',
    author: 'El Destape',
    thumbnailUrl: '',
    sourceUrl: 'https://www.youtube.com/@eldestapetv/live',
    slot: 'En vivo',
    liveCategory: 'Cable & Noticias',
    addedAt: '2026-11-22T00:00:00.000Z'
  },

  // ── TV DE AIRE ARGENTINA (SEGÚN FRANJA EN VIVO) ──────────────────────────
  {
    id: 'live-telefe',
    provider: 'youtube_live',
    providerId: 'UCHc3el42hXKKhjs_1vzWk9A',
    title: 'Telefe · En Vivo',
    author: 'Telefe Oficial',
    thumbnailUrl: '',
    sourceUrl: 'https://www.youtube.com/@telefe/live',
    slot: 'En vivo',
    liveCategory: 'TV de Aire',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-elnueve',
    provider: 'youtube_live',
    providerId: 'UCUT4NmGqjrVpKf2JyiS_bbA',
    title: 'El Nueve (Canal 9) · En Vivo',
    author: 'El Nueve Oficial',
    thumbnailUrl: '',
    sourceUrl: 'https://www.youtube.com/@elnueve/live',
    slot: 'En vivo',
    liveCategory: 'TV de Aire',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-telenueve',
    provider: 'youtube_live',
    providerId: 'UCgmyiPyB_-v5e9ef7Xi1HPw',
    title: 'Telenueve · En Vivo',
    author: 'Telenueve Oficial',
    thumbnailUrl: '',
    sourceUrl: 'https://www.youtube.com/@telenueve/live',
    slot: 'En vivo',
    liveCategory: 'TV de Aire',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-eltrece',
    provider: 'youtube_live',
    providerId: 'UC0DM_mHV2u6dj8ig51GkQwg',
    title: 'El Trece · En Vivo',
    author: 'eltrece Oficial',
    thumbnailUrl: '',
    sourceUrl: 'https://www.youtube.com/@eltrece/live',
    slot: 'En vivo',
    liveCategory: 'TV de Aire',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-americatv',
    provider: 'youtube_live',
    providerId: 'UCXijW1aVOrGbYc1menLah3Q',
    title: 'América TV · En Vivo',
    author: 'América TV Oficial',
    thumbnailUrl: '',
    sourceUrl: 'https://www.youtube.com/@americatvok/live',
    slot: 'En vivo',
    liveCategory: 'TV de Aire',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-tvpublica',
    provider: 'youtube_live',
    providerId: 'UCqmZBc7T8J5TFuRT5uf-j_g',
    title: 'TV Pública Noticias · En Vivo',
    author: 'Televisión Pública',
    thumbnailUrl: '',
    sourceUrl: 'https://www.youtube.com/@CanalSieteNoticias/live',
    slot: 'En vivo',
    liveCategory: 'TV de Aire',
    addedAt: '2026-11-22T00:00:00.000Z'
  },

  // ── STREAMS EN VIVO (SEGÚN PROGRAMACIÓN) ─────────────────────────────────
  {
    id: 'live-carnaval',
    provider: 'youtube_live',
    providerId: 'UCRtgbxUH456ox51IswIQgZQ',
    title: 'Carnaval Stream · En Vivo',
    author: 'Carnaval Stream',
    thumbnailUrl: '',
    sourceUrl: 'https://www.youtube.com/@carnavalstream/live',
    slot: 'En vivo',
    liveCategory: 'Streams en Vivo',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-olga',
    provider: 'youtube_live',
    providerId: 'UCWXRkZWaGqz-LCIHfCFR40w',
    title: 'OLGA · En Vivo',
    author: 'OLGA',
    thumbnailUrl: '',
    sourceUrl: 'https://www.youtube.com/@olgaenvivo/live',
    slot: 'En vivo',
    liveCategory: 'Streams en Vivo',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-blender',
    provider: 'youtube_live',
    providerId: 'UC6pJGaMdx5Ter_8zYbLoRgA',
    title: 'Blender · En Vivo',
    author: 'Blender',
    thumbnailUrl: '',
    sourceUrl: 'https://www.youtube.com/@estoesblender/live',
    slot: 'En vivo',
    liveCategory: 'Streams en Vivo',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-gelatina',
    provider: 'youtube_live',
    providerId: 'UCWSfXECGo1qK_H7SXRaUSMg',
    title: 'Gelatina · En Vivo',
    author: 'Gelatina',
    thumbnailUrl: '',
    sourceUrl: 'https://www.youtube.com/@SomosGelatina/live',
    slot: 'En vivo',
    liveCategory: 'Streams en Vivo',
    addedAt: '2026-11-22T00:00:00.000Z'
  },
  {
    id: 'live-urbanaplay',
    provider: 'youtube_live',
    providerId: 'UCC1kfsMJko54AqxtcFECt-A',
    title: 'Urbana Play FM · En Vivo',
    author: 'Urbana Play 104.3',
    thumbnailUrl: '',
    sourceUrl: 'https://www.youtube.com/@UrbanaPlayFM/live',
    slot: 'En vivo',
    liveCategory: 'Streams en Vivo',
    addedAt: '2026-11-22T00:00:00.000Z'
  }
];

export const OFFICIAL_LIVE_TV_CHANNEL: MiTvChannel = {
  id: OFFICIAL_LIVE_TV_CHANNEL_ID,
  name: 'TV en Vivo (Oficial)',
  items: OFFICIAL_LIVE_TV_ITEMS,
  updatedAt: '2026-11-22T00:00:00.000Z'
};

export interface MiTvChannel {
  id: string;
  name: string;
  items: MiTvItem[];
  publishedToMySignal?: boolean;
  updatedAt: string;
}

export interface MiTvWorkspace {
  channels: MiTvChannel[];
  activeChannelId: string;
}

const DEFAULT_CHANNEL_ID = 'mitv-hoy';

function defaultWorkspace(): MiTvWorkspace {
  return {
    activeChannelId: DEFAULT_CHANNEL_ID,
    channels: [
      {
        id: DEFAULT_CHANNEL_ID,
        name: 'Para ver hoy',
        items: [],
        updatedAt: new Date().toISOString()
      }
    ]
  };
}

export function extractYouTubeId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(
    /(?:youtu\.be\/|(?:music\.|www\.|m\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/i
  );
  return match?.[1] || null;
}

export function extractVimeoId(raw: string): string | null {
  const match = raw.trim().match(/vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d{6,12})/i);
  return match?.[1] || null;
}

export function extractDailymotionId(raw: string): string | null {
  const match = raw.trim().match(/(?:dailymotion\.com\/(?:video|embed\/video)\/|dai\.ly\/)([a-zA-Z0-9]+)/i);
  return match?.[1] || null;
}

export function isDirectVideoUrl(raw: string): boolean {
  return /^https?:\/\/.+\.(mp4|webm|ogg)(\?.*)?$/i.test(raw.trim());
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 3500): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Resuelve cualquier URL soportada para MiTV con 0 cuota API */
export async function resolveMiTvPointer(
  rawUrl: string,
  slot: MiTvSlot = 'Ahora'
): Promise<{ ok: true; item: MiTvItem } | { ok: false; error: string }> {
  const cleaned = rawUrl.trim();
  if (!cleaned) {
    return { ok: false, error: 'Pegá una URL de YouTube, Vimeo, Dailymotion o un enlace MP4.' };
  }

  // 1. YouTube
  const ytId = extractYouTubeId(cleaned);
  if (ytId) {
    const watchUrl = `https://www.youtube.com/watch?v=${ytId}`;
    let title = `Video de YouTube (${ytId})`;
    let author = 'YouTube';
    const meta = await fetchJsonWithTimeout(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`
    );
    if (typeof meta?.title === 'string' && meta.title.trim()) title = meta.title.trim();
    if (typeof meta?.author_name === 'string' && meta.author_name.trim()) {
      author = meta.author_name.trim();
    }
    return {
      ok: true,
      item: {
        id: `mitv-yt-${ytId}-${Date.now().toString(36)}`,
        provider: 'youtube',
        providerId: ytId,
        title,
        author,
        thumbnailUrl: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
        sourceUrl: watchUrl,
        slot,
        watched: false,
        addedAt: new Date().toISOString()
      }
    };
  }

  // 2. Vimeo
  const vimeoId = extractVimeoId(cleaned);
  if (vimeoId) {
    const pageUrl = `https://vimeo.com/${vimeoId}`;
    let title = `Video de Vimeo (${vimeoId})`;
    let author = 'Vimeo';
    let thumbnailUrl = '';
    const meta = await fetchJsonWithTimeout(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(pageUrl)}`
    );
    if (typeof meta?.title === 'string' && meta.title.trim()) title = meta.title.trim();
    if (typeof meta?.author_name === 'string' && meta.author_name.trim()) {
      author = meta.author_name.trim();
    }
    if (typeof meta?.thumbnail_url === 'string' && meta.thumbnail_url.trim()) {
      thumbnailUrl = meta.thumbnail_url.trim();
    }
    return {
      ok: true,
      item: {
        id: `mitv-vm-${vimeoId}-${Date.now().toString(36)}`,
        provider: 'vimeo',
        providerId: vimeoId,
        title,
        author,
        thumbnailUrl,
        sourceUrl: pageUrl,
        slot,
        watched: false,
        addedAt: new Date().toISOString()
      }
    };
  }

  // 3. Dailymotion
  const dmId = extractDailymotionId(cleaned);
  if (dmId) {
    const pageUrl = `https://www.dailymotion.com/video/${dmId}`;
    let title = `Video de Dailymotion (${dmId})`;
    let author = 'Dailymotion';
    let thumbnailUrl = `https://www.dailymotion.com/thumbnail/video/${dmId}`;
    const meta = await fetchJsonWithTimeout(
      `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(pageUrl)}`
    );
    if (typeof meta?.title === 'string' && meta.title.trim()) title = meta.title.trim();
    if (typeof meta?.author_name === 'string' && meta.author_name.trim()) {
      author = meta.author_name.trim();
    }
    if (typeof meta?.thumbnail_url === 'string' && meta.thumbnail_url.trim()) {
      thumbnailUrl = meta.thumbnail_url.trim();
    }
    return {
      ok: true,
      item: {
        id: `mitv-dm-${dmId}-${Date.now().toString(36)}`,
        provider: 'dailymotion',
        providerId: dmId,
        title,
        author,
        thumbnailUrl,
        sourceUrl: pageUrl,
        slot,
        watched: false,
        addedAt: new Date().toISOString()
      }
    };
  }

  // 4. TikTok (videos, photos, embeds y links cortos vm.tiktok.com / vt.tiktok.com / /t/)
  if (/tiktok\.com/i.test(cleaned)) {
    const extractTikTok = (u: string) => {
      const m =
        u.match(/tiktok\.com\/(?:@([^/?#]+)\/(?:video|photo)\/|(?:video|photo)\/|embed\/v2\/|v\/)(\d{8,24})/i) ||
        u.match(/[?&]item_id=(\d{8,24})/i);
      if (!m) return null;
      const id = m[2] || m[1];
      const handle = m[2] && m[1] ? `@${m[1]}` : 'TikTok';
      return { id, handle };
    };

    let effectiveTtUrl = cleaned;
    let extracted = extractTikTok(effectiveTtUrl);
    const meta = await fetchJsonWithTimeout(
      `/api/mitv/social-meta?url=${encodeURIComponent(cleaned)}`
    );
    if (!extracted && typeof meta?.finalUrl === 'string' && meta.finalUrl) {
      effectiveTtUrl = meta.finalUrl;
      extracted = extractTikTok(effectiveTtUrl);
    }

    if (extracted?.id) {
      const ttId = extracted.id;
      const handle = extracted.handle;
      let title = `Video de TikTok (${handle})`;
      let author = handle;
      let thumbnailUrl = '';
      if (typeof meta?.title === 'string' && meta.title.trim()) title = meta.title.trim();
      if (typeof meta?.author === 'string' && meta.author.trim()) author = meta.author.trim();
      if (typeof meta?.thumbnailUrl === 'string' && meta.thumbnailUrl.trim()) {
        thumbnailUrl = meta.thumbnailUrl.trim();
      }
      return {
        ok: true,
        item: {
          id: `mitv-tt-${ttId}-${Date.now().toString(36)}`,
          provider: 'tiktok',
          providerId: ttId,
          title,
          author,
          thumbnailUrl,
          sourceUrl: effectiveTtUrl,
          slot,
          watched: false,
          addedAt: new Date().toISOString()
        }
      };
    }
  }

  // 5. Instagram (Reels y publicaciones públicas · resuelve miniatura og:image)
  const igMatch = cleaned.match(/instagram\.com\/(?:[^/?#]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]{5,30})/i);
  if (igMatch?.[2]) {
    const kind = igMatch[1].toLowerCase() === 'reels' ? 'reel' : igMatch[1].toLowerCase();
    const shortcode = igMatch[2];
    const canonical = `https://www.instagram.com/${kind}/${shortcode}/`;
    const meta = await fetchJsonWithTimeout(
      `/api/mitv/social-meta?url=${encodeURIComponent(canonical)}`
    );
    const title =
      typeof meta?.title === 'string' && meta.title.trim()
        ? meta.title.trim()
        : kind === 'reel'
          ? `Reel de Instagram (${shortcode})`
          : `Publicación de Instagram (${shortcode})`;
    const thumbnailUrl =
      typeof meta?.thumbnailUrl === 'string' && meta.thumbnailUrl.trim()
        ? meta.thumbnailUrl.trim()
        : '';
    return {
      ok: true,
      item: {
        id: `mitv-ig-${shortcode}-${Date.now().toString(36)}`,
        provider: 'instagram',
        providerId: `${kind}/${shortcode}`,
        title,
        author: 'Instagram',
        thumbnailUrl,
        sourceUrl: canonical,
        slot,
        watched: false,
        addedAt: new Date().toISOString()
      }
    };
  }

  // 6. Facebook (videos y Reels públicos · limpia parámetros y resuelve og:image)
  if (/(?:facebook\.com|fb\.watch)\//i.test(cleaned)) {
    let normalizedFb = cleaned;
    try {
      const u = new URL(cleaned);
      const watchV = u.searchParams.get('v');
      if (watchV && /\/watch\/?/i.test(u.pathname)) {
        normalizedFb = `https://www.facebook.com/watch/?v=${watchV}`;
      } else if (/\/(reel|videos)\//i.test(u.pathname)) {
        normalizedFb = `${u.origin}${u.pathname}`;
      }
    } catch {
      // mantener URL original
    }
    const meta = await fetchJsonWithTimeout(
      `/api/mitv/social-meta?url=${encodeURIComponent(normalizedFb)}`
    );
    const idSlug = normalizedFb.replace(/[^a-zA-Z0-9]/g, '').slice(-14) || Date.now().toString(36);
    return {
      ok: true,
      item: {
        id: `mitv-fb-${idSlug}-${Date.now().toString(36)}`,
        provider: 'facebook',
        providerId: normalizedFb,
        title:
          typeof meta?.title === 'string' && meta.title.trim()
            ? meta.title.trim()
            : /\/reel\//i.test(normalizedFb)
              ? 'Reel de Facebook'
              : 'Video de Facebook',
        author: 'Facebook',
        thumbnailUrl:
          typeof meta?.thumbnailUrl === 'string' && meta.thumbnailUrl.trim()
            ? meta.thumbnailUrl.trim()
            : '',
        sourceUrl: normalizedFb,
        slot,
        watched: false,
        addedAt: new Date().toISOString()
      }
    };
  }

  // 7. Twitch (canales en vivo y VODs)
  const twitchVod = cleaned.match(/twitch\.tv\/videos\/(\d+)/i);
  const twitchCh = !twitchVod ? cleaned.match(/twitch\.tv\/([A-Za-z0-9_]{2,30})(?:[/?#]|$)/i) : null;
  if (twitchVod?.[1] || twitchCh?.[1]) {
    const isVod = Boolean(twitchVod?.[1]);
    const pid = isVod ? `video:${twitchVod![1]}` : `channel:${twitchCh![1].toLowerCase()}`;
    return {
      ok: true,
      item: {
        id: `mitv-tw-${pid.replace(':', '-')}-${Date.now().toString(36)}`,
        provider: 'twitch',
        providerId: pid,
        title: isVod ? `Twitch VOD #${twitchVod![1]}` : `Twitch · ${twitchCh![1]} En Vivo`,
        author: isVod ? 'Twitch' : twitchCh![1],
        thumbnailUrl: '',
        sourceUrl: cleaned,
        slot: isVod ? slot : 'En vivo',
        watched: false,
        addedAt: new Date().toISOString()
      }
    };
  }

  // 8. X / Twitter (posts y videos públicos: /user/status/, /i/status/, /i/web/status/, /statuses/)
  const xMatch = cleaned.match(
    /(?:x\.com|twitter\.com)\/(?:i\/web\/|i\/|([A-Za-z0-9_]+)\/)status(?:es)?\/(\d{8,24})/i
  );
  if (xMatch?.[2]) {
    const handle = xMatch[1] || 'x';
    const tweetId = xMatch[2];
    return {
      ok: true,
      item: {
        id: `mitv-x-${tweetId}-${Date.now().toString(36)}`,
        provider: 'x',
        providerId: tweetId,
        title: handle === 'x' ? `Publicación en X (#${tweetId.slice(-6)})` : `Publicación de @${handle} en X`,
        author: handle === 'x' ? 'X' : `@${handle}`,
        thumbnailUrl: '',
        sourceUrl: handle === 'x' ? `https://x.com/i/status/${tweetId}` : `https://x.com/${handle}/status/${tweetId}`,
        slot,
        watched: false,
        addedAt: new Date().toISOString()
      }
    };
  }

  // 9. Enlace directo MP4 / WebM
  if (isDirectVideoUrl(cleaned)) {
    const fileName = cleaned.split('/').pop()?.split('?')[0] || 'Video directo';
    return {
      ok: true,
      item: {
        id: `mitv-mp4-${Date.now().toString(36)}`,
        provider: 'direct',
        providerId: cleaned,
        title: decodeURIComponent(fileName).replace(/\.(mp4|webm|ogg)$/i, ''),
        author: 'Video directo',
        thumbnailUrl: '',
        sourceUrl: cleaned,
        slot,
        watched: false,
        addedAt: new Date().toISOString()
      }
    };
  }

  return {
    ok: false,
    error:
      'URL no reconocida. Pegá un enlace de YouTube, TikTok, Instagram, Facebook, Twitch, X, Vimeo, Dailymotion o MP4.'
  };
}

export function loadMiTvWorkspace(): MiTvWorkspace {
  if (typeof window === 'undefined') return defaultWorkspace();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWorkspace();
    const parsed = JSON.parse(raw);
    const channels: MiTvChannel[] =
      Array.isArray(parsed?.channels) && parsed.channels.length > 0
        ? parsed.channels
        : defaultWorkspace().channels;
    const activeChannelId =
      typeof parsed?.activeChannelId === 'string' &&
      channels.some((c) => c.id === parsed.activeChannelId)
        ? parsed.activeChannelId
        : channels[0].id;
    return { channels, activeChannelId };
  } catch {
    return defaultWorkspace();
  }
}

export function saveMiTvWorkspace(ws: MiTvWorkspace): MiTvWorkspace {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
    } catch {
      // ignore storage quota errors
    }
  }
  void syncMiTvWorkspaceToCloud(ws);
  return ws;
}

async function syncMiTvWorkspaceToCloud(ws: MiTvWorkspace): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user || user.is_anonymous) return;
    const compact = ws.channels.slice(0, 12).map((ch) => ({
      id: ch.id,
      name: ch.name,
      publishedToMySignal: Boolean(ch.publishedToMySignal),
      updatedAt: ch.updatedAt,
      items: ch.items.slice(0, 40).map((it) => ({
        id: it.id,
        provider: it.provider,
        providerId: it.providerId,
        title: it.title.slice(0, 100),
        author: it.author.slice(0, 60),
        thumbnailUrl: it.thumbnailUrl,
        sourceUrl: it.sourceUrl,
        slot: it.slot,
        watched: Boolean(it.watched),
        addedAt: it.addedAt
      }))
    }));
    await supabase.auth.updateUser({
      data: { youapp_mitv_channels_v1: compact }
    });
  } catch {
    // fallback silencioso a localStorage
  }
}

export async function loadMiTvWorkspaceFromCloud(): Promise<MiTvWorkspace | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user || user.is_anonymous) return null;
    const cloudChannels = (user.user_metadata as any)?.youapp_mitv_channels_v1;
    if (!Array.isArray(cloudChannels) || cloudChannels.length === 0) return null;

    const local = loadMiTvWorkspace();
    const byId = new Map<string, MiTvChannel>();
    for (const ch of local.channels) byId.set(ch.id, ch);
    for (const cch of cloudChannels as MiTvChannel[]) {
      if (!cch?.id || !Array.isArray(cch.items)) continue;
      const existing = byId.get(cch.id);
      const cloudTs = Date.parse(cch.updatedAt || '') || 0;
      const localTs = Date.parse(existing?.updatedAt || '') || 0;
      if (!existing || (cch.items.length > 0 && cloudTs > localTs)) {
        byId.set(cch.id, cch);
      }
    }
    const merged: MiTvWorkspace = {
      channels: Array.from(byId.values()),
      activeChannelId: local.activeChannelId
    };
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // ignore
      }
    }
    return merged;
  } catch {
    return null;
  }
}

export function buildMiTvShareUrl(channel: MiTvChannel): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://youapp.tv';
  const ytIds = channel.items
    .filter((i) => i.provider === 'youtube')
    .map((i) => i.providerId)
    .slice(0, 25)
    .join(',');
  const params = new URLSearchParams();
  params.set('ch', channel.name);
  if (ytIds) params.set('ids', ytIds);
  return `${origin}/mitv?${params.toString()}`;
}
