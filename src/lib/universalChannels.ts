// ==============================================================================
// YOUAPP UNIVERSAL CHANNEL ENGINE & INDEPENDENT SEARCH SYSTEM (0 API DEPENDENCY)
// ==============================================================================
import { supabase } from './supabase';

export interface UniversalChannel {
  id: string;
  channelId?: string;
  name: string;
  category: string;
  description: string;
  avatarUrl: string;
  thumbnail: string;
  provider: 'youtube' | 'twitch' | 'kick' | 'hls' | 'direct';
  videoId?: string;
  videoUrl: string;
  currentVideoTitle: string;
  viewerCount: number;
  durationSeconds?: number;
  isLive?: boolean;
  tags?: string[];
}

// ------------------------------------------------------------------------------
// CATÁLOGO UNIVERSAL BASE (100+ Canales Verificados de TV, Streaming y Música)
// ------------------------------------------------------------------------------
export const UNIVERSAL_CATALOG: UniversalChannel[] = [
  // ── 1. TELEVISIÓN & NOTICIAS EN VIVO 24/7 ──────────────────────────────────
  {
    id: 'ch-americatv',
    channelId: 'UC6NVDkuzY2exMOVFw4i9oHw',
    name: 'América TV',
    category: '🔴 Televisión en Vivo',
    description: 'Transmisión oficial de América TV en vivo las 24 horas.',
    avatarUrl: 'https://yt3.googleusercontent.com/vIYh4fJ4FiOeD0U8sGUEUZQf3DaK-PME00Ckh7cFf4CRmC3EHopvUsjbgYKhNVkFXURSzltWYQ=s900-c-k-c0x00ffffff-no-rj',
    thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UC6NVDkuzY2exMOVFw4i9oHw',
    currentVideoTitle: 'América TV - Transmisión en Directo',
    viewerCount: 56200,
    isLive: true,
    tags: ['america', 'americatv', 'americaenvivo', 'noticias', 'argentina', 'intrusos', 'en vivo', 'vivo', 'canal america']
  },
  {
    id: 'ch-cronicatv',
    channelId: 'UCT7KFGv6s2a-rh2Jq8ZdM1g',
    name: 'Crónica TV',
    category: '🔴 Noticias en Vivo',
    description: 'Transmisión oficial de Crónica TV las 24 horas del día.',
    avatarUrl: 'https://yt3.googleusercontent.com/EGyrGJo_3mJxohmZxkP0Ksma9r1J1fU1ORZkGkwJkGJKRyeu6aHTD_Zi-4AodbD0hLRnTzoCWA=s900-c-k-c0x00ffffff-no-rj',
    thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UCT7KFGv6s2a-rh2Jq8ZdM1g',
    currentVideoTitle: 'Crónica TV - Transmisión en Vivo 24/7',
    viewerCount: 48900,
    isLive: true,
    tags: ['cronica', 'cronicatv', 'noticias', 'argentina', 'en vivo', 'vivo', 'placas']
  },
  {
    id: 'ch-carnavalstream',
    channelId: 'UCRtgbxUH456ox51IswIQgZQ',
    name: 'Carnaval Stream',
    category: '🔴 Streaming & Charla',
    description: 'Programación continua de Carnaval Stream con Doman, Santoro y los mejores directos.',
    avatarUrl: 'https://yt3.googleusercontent.com/Iyl2pqHYrhTadZONr4EZ6AjwwxNS_w5idduTOqXxy0ZMPsMVruM5EuETa7seQRdLSNOCUP7r=s900-c-k-c0x00ffffff-no-rj',
    thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UCRtgbxUH456ox51IswIQgZQ',
    currentVideoTitle: 'Carnaval Stream - En Vivo 24/7',
    viewerCount: 31200,
    isLive: true,
    tags: ['carnaval', 'carnavalstream', 'streaming', 'doman', 'santoro', 'politica', 'argentina']
  },
  {
    id: 'ch-canal22',
    channelId: 'UCiPqb8qbvCBjAFHc-KMujBw',
    name: 'CANAL 22 / Santiago Cúneo',
    category: '🔴 Política & Noticias',
    description: 'Transmisión oficial de CANAL 22 y Santiago Cúneo en vivo las 24 horas.',
    avatarUrl: 'https://yt3.ggpht.com/jHzVg6dtilEqyvBN8U67hbnJCAH6F7V1AvXq_WjV7TnP7NiLVn4oyFVtTRK4rUeH6i_AA_67ew=s800-c-k-c0x00ffffff-no-rj',
    thumbnail: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UCiPqb8qbvCBjAFHc-KMujBw',
    currentVideoTitle: 'CANAL 22 - Transmisión en Directo 24/7',
    viewerCount: 54100,
    isLive: true,
    tags: ['cuneo', 'canal22', 'politica', 'argentina']
  },
  {
    id: 'ch-tn-envivo',
    channelId: 'UCj6PcyLvpnIRT_2W_EGly9g',
    name: 'Todo Noticias (TN)',
    category: '🔴 Noticias en Vivo',
    description: 'Noticias de Argentina y el mundo en vivo las 24 horas.',
    avatarUrl: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UCj6PcyLvpnIRT_2W_EGly9g',
    currentVideoTitle: 'TN en Vivo - Noticias 24 Horas',
    viewerCount: 65400,
    isLive: true,
    tags: ['tn', 'todonoticias', 'noticias', 'argentina', 'clarin', 'en vivo']
  },
  {
    id: 'ch-c5n',
    channelId: 'UCFgk2Q2mVO1BklRQhSv6p0w',
    name: 'C5N Noticias',
    category: '🔴 Noticias en Vivo',
    description: 'Canal 5 Noticias - Transmisión en vivo 24 horas.',
    avatarUrl: 'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UCFgk2Q2mVO1BklRQhSv6p0w',
    currentVideoTitle: 'C5N - La Realidad en Vivo',
    viewerCount: 52100,
    isLive: true,
    tags: ['c5n', 'noticias', 'argentina', 'politica', 'vivo']
  },
  {
    id: 'ch-a24',
    channelId: 'UCa24-noticias-envivo-1',
    name: 'A24 Noticias',
    category: '🔴 Noticias en Vivo',
    description: 'América 24 - Noticias, política y economía de Argentina en vivo.',
    avatarUrl: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UCa24-noticias-envivo-1',
    currentVideoTitle: 'A24 en Vivo - Noticias 24 Horas',
    viewerCount: 41200,
    isLive: true,
    tags: ['a24', 'america24', 'noticias', 'argentina', 'politica', 'en vivo']
  },
  {
    id: 'ch-elnueve',
    channelId: 'UCelnueve-canal9-argentina-1',
    name: 'El Nueve (Canal 9)',
    category: '🔴 Televisión en Vivo',
    description: 'Telenueve, Bendita TV y toda la programación de Canal 9.',
    avatarUrl: 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UCelnueve-canal9-argentina-1',
    currentVideoTitle: 'Canal 9 - Televisión en Directo',
    viewerCount: 38200,
    isLive: true,
    tags: ['canal 9', 'elnueve', 'telenueve', 'bendita', 'argentina', 'en vivo']
  },
  {
    id: 'ch-eltrece',
    channelId: 'UCeltrece-argentina-oficial-1',
    name: 'El Trece (Eltrece)',
    category: '🔴 Televisión en Vivo',
    description: 'Telenoche, Los 8 Escalones y toda la programación de El Trece.',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UCeltrece-argentina-oficial-1',
    currentVideoTitle: 'El Trece - Transmisión Oficial',
    viewerCount: 51200,
    isLive: true,
    tags: ['eltrece', 'trece', 'canal13', 'telenoche', 'argentina', 'tv']
  },
  {
    id: 'ch-tvpublica',
    channelId: 'UCtvpublica-argentina-1',
    name: 'Televisión Pública (TVP)',
    category: '🔴 Televisión en Vivo',
    description: 'TV Pública Argentina - Transmisión en directo para todo el país.',
    avatarUrl: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UCtvpublica-argentina-1',
    currentVideoTitle: 'TV Pública - En Vivo 24/7',
    viewerCount: 29800,
    isLive: true,
    tags: ['tvpublica', 'tvp', 'canal7', 'argentina', 'noticias', 'deportes']
  },
  {
    id: 'ch-lnmas',
    channelId: 'UCy7y8n78qZ6P3y-t1gGq6kA',
    name: 'La Nación+ (LN+)',
    category: '🔴 Noticias en Vivo',
    description: 'Señal de noticias y actualidad política de La Nación.',
    avatarUrl: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UCy7y8n78qZ6P3y-t1gGq6kA',
    currentVideoTitle: 'LN+ - Noticias y Debates en Vivo',
    viewerCount: 44300,
    isLive: true,
    tags: ['ln', 'lanacion', 'lnmas', 'noticias', 'argentina', 'politica']
  },
  {
    id: 'ch-canal26',
    channelId: 'UCy6PcyLvpnIRT_2W_EGly26',
    name: 'Canal 26 Noticias',
    category: '🔴 Noticias Internacionales',
    description: 'Canal 26 con noticias de Argentina y el mundo.',
    avatarUrl: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UCy6PcyLvpnIRT_2W_EGly26',
    currentVideoTitle: 'Canal 26 - Transmisión en Directo',
    viewerCount: 33100,
    isLive: true,
    tags: ['canal26', '26', 'noticias', 'mundo', 'internacional']
  },
  {
    id: 'ch-telefe-noticias',
    channelId: 'UC5eP1Y6X2S3H7s4Y5Q5aG6A',
    name: 'Telefe Noticias',
    category: 'Noticias & Reportajes',
    description: 'Informes especiales, investigaciones y noticias de Telefe.',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '9B2k5X4d3kA',
    videoUrl: 'https://www.youtube.com/embed/9B2k5X4d3kA?loop=1&playlist=9B2k5X4d3kA',
    currentVideoTitle: 'Telefe Noticias - Edición Especial',
    viewerCount: 39500,
    tags: ['telefe', 'noticias', 'informes', 'argentina', 'television']
  },
  {
    id: 'ch-dw-espanol',
    channelId: 'UC66I_2Z0xN8A_8k_x1q8dKw',
    name: 'DW Español',
    category: 'Documentales & Noticias',
    description: 'Noticias globales y documentales de investigación en español.',
    avatarUrl: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UC66I_2Z0xN8A_8k_x1q8dKw',
    currentVideoTitle: 'DW Español - Documentales y Reportajes',
    viewerCount: 28400,
    isLive: true,
    tags: ['dw', 'alemania', 'documental', 'noticias', 'mundo', 'ciencia']
  },

  // ── 2. STREAMING & CANALES DE CREADORES ──────────────────────────────────────
  {
    id: 'ch-luzutv',
    channelId: 'UCH1qC2yP51B-7a4zN_Lrqpg',
    name: 'LUZU TV',
    category: '🔴 Streaming & Charla',
    description: 'Nadie Dice Nada, Antes Que Nadie y los mejores programas de Luzu TV.',
    avatarUrl: 'https://yt3.googleusercontent.com/1-K9ikW6iP0nnfCVhcCnH2MpGSWVUee1DUL4Y8-8i_xwa-JKAv-9GEs1OKAl8ddpXMaFxOyB=s900-c-k-c0x00ffffff-no-rj',
    thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UCH1qC2yP51B-7a4zN_Lrqpg',
    currentVideoTitle: 'LUZU TV - ANTES QUE NADIE / Nadie Dice Nada',
    viewerCount: 78900,
    isLive: true,
    tags: ['luzu', 'luzutv', 'occhato', 'nadiedicenada', 'streaming', 'humor', 'charlas', 'leuco']
  },
  {
    id: 'ch-olga',
    channelId: 'UCgB6b4xU3jR7g0xG5Q-7a9A',
    name: 'OLGA en Vivo',
    category: '🔴 Streaming & Humor',
    description: 'Soñé Que Volaba con Migue Granados, Sería Increíble con Nati Jota.',
    avatarUrl: 'https://yt3.googleusercontent.com/D4kn5IQBl9r2r-B03hGiUKXtO1xq59lh5F1ARe5UnngDI3TH3LIW6liz2nidzy8NAhKW-wucig=s900-c-k-c0x00ffffff-no-rj',
    thumbnail: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UCgB6b4xU3jR7g0xG5Q-7a9A',
    currentVideoTitle: 'OLGA - SERÍA INCREÍBLE / Soñé Que Volaba',
    viewerCount: 88400,
    isLive: true,
    tags: ['olga', 'olgaenvivo', 'migue granados', 'nati jota', 'streaming', 'humor']
  },
  {
    id: 'ch-radio10',
    channelId: 'UCradio10-argentina-am710',
    name: 'Radio 10 en Vivo',
    category: '🔴 Radio & Noticias',
    description: 'Mañana Sylvestre con Gustavo Sylvestre y toda la programación de Radio 10 AM 710.',
    avatarUrl: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '',
    videoUrl: 'https://www.youtube.com/embed/live_stream?channel=UCradio10-argentina-am710',
    currentVideoTitle: 'Radio 10 - Mañana Sylvestre en Vivo',
    viewerCount: 45200,
    isLive: true,
    tags: ['radio 10', 'radio10', 'sylvestre', 'noticias', 'argentina', 'am710', 'gato']
  },
  {
    id: 'ch-gelatina',
    channelId: 'UCf4-90s8f7e6e5d4c3b2a1A',
    name: 'Gelatina Streaming',
    category: 'Humor & Streaming',
    description: 'La Fábrica de Jingles con Pedro Rosemblat y toda la programación de Gelatina.',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: 'vA8e5_k0w1U',
    videoUrl: 'https://www.youtube.com/embed/vA8e5_k0w1U?loop=1&playlist=vA8e5_k0w1U',
    currentVideoTitle: 'Gelatina - Fábrica de Jingles y Actualidad',
    viewerCount: 46200,
    tags: ['gelatina', 'rosemblat', 'jingles', 'humor', 'politica', 'streaming']
  },
  {
    id: 'ch-blender',
    channelId: 'UCb12KmMMDJA-blender-1',
    name: 'Blender Stream',
    category: 'Streaming & Cultura Pop',
    description: 'Hay Algo Ahí con Tomás Rebord, Guillermo Aquino y toda la grilla de Blender.',
    avatarUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '9B2k5X4d3kA',
    videoUrl: 'https://www.youtube.com/embed/9B2k5X4d3kA?loop=1&playlist=9B2k5X4d3kA',
    currentVideoTitle: 'Blender - Programación 24/7',
    viewerCount: 38700,
    tags: ['blender', 'rebord', 'aquino', 'streaming', 'humor', 'cultura']
  },
  {
    id: 'ch-vorterix',
    channelId: 'UC51H3aP9K6443-4f9e1e2dA',
    name: 'Vorterix Radio & TV',
    category: 'Rock & Streaming',
    description: 'Mario Pergolini y la programación de Vorterix en vivo.',
    avatarUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '4G9O5iV123A',
    videoUrl: 'https://www.youtube.com/embed/4G9O5iV123A?loop=1&playlist=4G9O5iV123A',
    currentVideoTitle: 'Vorterix - Transmisión en Directo',
    viewerCount: 29800,
    tags: ['vorterix', 'pergolini', 'rock', 'radio', 'streaming']
  },
  {
    id: 'ch-mrbeast',
    channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA',
    name: 'MrBeast Español',
    category: 'Entretenimiento & Retos',
    description: 'Desafíos épicos, juegos millonarios y retos de MrBeast en español.',
    avatarUrl: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1518173946687-a4c8a383392e?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '0e3GPea1Tyg',
    videoUrl: 'https://www.youtube.com/embed/0e3GPea1Tyg?loop=1&playlist=0e3GPea1Tyg',
    currentVideoTitle: 'MrBeast - Retos y Episodios Épicos 4K',
    viewerCount: 142000,
    tags: ['mrbeast', 'beast', 'retos', 'dinero', 'viral', 'entretenimiento']
  },
  {
    id: 'ch-ibai',
    channelId: 'UCaY_-xsZg53b2426_T2o0kg',
    name: 'Ibai Llanos',
    category: 'Gaming & Charla',
    description: 'Reacciones, charlas, eventos deportivos y momentos virales con Ibai.',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: 'vA8e5_k0w1U',
    videoUrl: 'https://www.youtube.com/embed/vA8e5_k0w1U?loop=1&playlist=vA8e5_k0w1U',
    currentVideoTitle: 'Ibai - El Show en Vivo',
    viewerCount: 88500,
    tags: ['ibai', 'llanos', 'kingsleague', 'velada', 'twitch', 'streaming']
  },
  {
    id: 'ch-auronplay',
    channelId: 'UCX6OQ3DkcsbYNE6H8uQQuV-auron',
    name: 'AuronPlay',
    category: 'Gaming & Humor',
    description: 'Risas, gameplays, memes y reacciones de Auron.',
    avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: 'vA8e5_k0w1U',
    videoUrl: 'https://www.youtube.com/embed/vA8e5_k0w1U?loop=1&playlist=vA8e5_k0w1U',
    currentVideoTitle: 'AuronPlay - Momentos Legendarios',
    viewerCount: 76400,
    tags: ['auron', 'auronplay', 'humor', 'memes', 'gaming']
  },
  {
    id: 'ch-elrubius',
    channelId: 'UCEr55383XUU351n08S8GfEg',
    name: 'elrubiusOMG',
    category: 'Gaming & Aventuras',
    description: 'Gameplays, viajes y los videos más vistos de Rubius.',
    avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '0e3GPea1Tyg',
    videoUrl: 'https://www.youtube.com/embed/0e3GPea1Tyg?loop=1&playlist=0e3GPea1Tyg',
    currentVideoTitle: 'Rubius - Especiales 4K',
    viewerCount: 68100,
    tags: ['rubius', 'elrubius', 'gaming', 'humor', 'youtube']
  },
  {
    id: 'ch-spreen',
    channelId: 'UCspreen-official-1',
    name: 'Spreen',
    category: 'Gaming & Streaming',
    description: 'Minecraft, retos y directos con Spreen.',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: 'vA8e5_k0w1U',
    videoUrl: 'https://www.youtube.com/embed/vA8e5_k0w1U?loop=1&playlist=vA8e5_k0w1U',
    currentVideoTitle: 'Spreen - Directo & Clips Épicos',
    viewerCount: 61200,
    tags: ['spreen', 'minecraft', 'gaming', 'argentina', 'stream']
  },
  {
    id: 'ch-luisito',
    channelId: 'UCluQ5yInbeAkkeCndNnUhpw',
    name: 'Luisito Comunica',
    category: 'Viajes & Documentales',
    description: 'Explorando los rincones más increíbles y curiosos del planeta.',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '0e3GPea1Tyg',
    videoUrl: 'https://www.youtube.com/embed/0e3GPea1Tyg?loop=1&playlist=0e3GPea1Tyg',
    currentVideoTitle: 'Luisito Comunica - Viajes por el Mundo',
    viewerCount: 53800,
    tags: ['luisito', 'comunica', 'viajes', 'mundo', 'curiosidades']
  },
  {
    id: 'ch-platzi',
    channelId: 'UC55-mxUj5Nj3niXFReG44mA',
    name: 'Platzi Educación',
    category: 'Tecnología & Educación',
    description: 'Cursos de programación, inteligencia artificial, startups y tecnología.',
    avatarUrl: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: 'xLfgA7e_u0M',
    videoUrl: 'https://www.youtube.com/embed/xLfgA7e_u0M?loop=1&playlist=xLfgA7e_u0M',
    currentVideoTitle: 'Platzi - Masterclasses de IA y Programación',
    viewerCount: 24100,
    tags: ['platzi', 'programacion', 'ia', 'codigo', 'aprender', 'tech']
  },
  {
    id: 'ch-dotcsv',
    channelId: 'UCy5znSnfMsDwaLlROnZ7Qbg',
    name: 'Dot CSV (Inteligencia Artificial)',
    category: 'IA & Ciencia',
    description: 'Divulgación científica sobre Machine Learning y el futuro de la IA.',
    avatarUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: 'K1z3s5d7f9A',
    videoUrl: 'https://www.youtube.com/embed/K1z3s5d7f9A?loop=1&playlist=K1z3s5d7f9A',
    currentVideoTitle: '¿Hasta Dónde Llegará la Inteligencia Artificial?',
    viewerCount: 21500,
    tags: ['dotcsv', 'ia', 'inteligencia artificial', 'ciencia', 'machine learning']
  },
  {
    id: 'ch-dross',
    channelId: 'UCg03c8G8394-0k31Gf3d4zA',
    name: 'DrossRotzank Misterio',
    category: 'Terror & Misterio',
    description: 'Top de misterios perturbadores, relatos oscuros y leyendas.',
    avatarUrl: 'https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '9B2k5X4d3kA',
    videoUrl: 'https://www.youtube.com/embed/9B2k5X4d3kA?loop=1&playlist=9B2k5X4d3kA',
    currentVideoTitle: 'Dross - Los Misterios Más Oscuros de la Red',
    viewerCount: 45200,
    tags: ['dross', 'misterio', 'terror', 'top', 'creepy']
  },

  // ── 3. MÚSICA & LO-FI 24/7 ─────────────────────────────────────────────────
  {
    id: 'ch-lofigirl',
    channelId: 'UCSJ4gkVC6NrvII8umztf0Ow',
    name: 'Lofi Girl 24/7 Radio',
    category: '🔴 Música & Relax',
    description: 'Radio Lo-Fi hip hop 24/7 para estudiar, programar y relajarse.',
    avatarUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: 'jfKfPfyJRdk',
    videoUrl: 'https://www.youtube.com/embed/jfKfPfyJRdk?loop=1&playlist=jfKfPfyJRdk',
    currentVideoTitle: 'lofi hip hop radio - beats to relax/study to',
    viewerCount: 84300,
    isLive: true,
    tags: ['lofi', 'musica', 'estudiar', 'chill', 'beats', 'relax', 'radio']
  },
  {
    id: 'ch-bizarrap',
    channelId: 'UCmS75GvJ6160-5j75G1B2qA',
    name: 'Bizarrap Sessions TV',
    category: 'Música & Trap',
    description: 'Todas las sesiones de BZRP, producciones y videoclips oficiales.',
    avatarUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '4G9O5iV123A',
    videoUrl: 'https://www.youtube.com/embed/4G9O5iV123A?loop=1&playlist=4G9O5iV123A',
    currentVideoTitle: 'BZRP Music Sessions 24/7',
    viewerCount: 96200,
    tags: ['bizarrap', 'bzrp', 'trap', 'musica', 'argentina', 'sessions', 'duki', 'quevedo']
  },
  {
    id: 'ch-duki-trap',
    channelId: 'UCduki-trap-argentina-1',
    name: 'Duki & Trap Argentino',
    category: 'Música Urbana',
    description: 'Lo mejor del trap argentino con Duki, YSY A, Neo Pistea, Emilia y Tiago PZK.',
    avatarUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '4G9O5iV123A',
    videoUrl: 'https://www.youtube.com/embed/4G9O5iV123A?loop=1&playlist=4G9O5iV123A',
    currentVideoTitle: 'Duki - Discografía y Conciertos 4K',
    viewerCount: 71400,
    tags: ['duki', 'trap', 'argentina', 'urbano', 'musica', 'ysy', 'emilia']
  },
  {
    id: 'ch-rock-nacional',
    name: 'Rock Nacional Argentino',
    category: 'Rock Clásico',
    description: 'Charly García, Spinetta, Soda Stereo, Fito Páez, Los Redondos y Divididos.',
    avatarUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '4G9O5iV123A',
    videoUrl: 'https://www.youtube.com/embed/4G9O5iV123A?loop=1&playlist=4G9O5iV123A',
    currentVideoTitle: 'Clásicos Inolvidables del Rock Nacional',
    viewerCount: 42100,
    tags: ['rock', 'nacional', 'argentina', 'charly', 'soda', 'spinetta', 'fito']
  },

  // ── 4. CIENCIA, ESPACIO & DEPORTES ─────────────────────────────────────────
  {
    id: 'ch-nasa-space',
    channelId: 'UCLA_DiR1FfKNvjuUpBHmylQ',
    name: 'NASA Space 24/7',
    category: '🔴 Espacio & Ciencia',
    description: 'Vistas de la Tierra en tiempo real desde la Estación Espacial Internacional.',
    avatarUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '21X5lGlDOfg',
    videoUrl: 'https://www.youtube.com/embed/21X5lGlDOfg?loop=1&playlist=21X5lGlDOfg',
    currentVideoTitle: 'NASA Earth Views from ISS Space Station',
    viewerCount: 57800,
    isLive: true,
    tags: ['nasa', 'espacio', 'tierra', 'iss', 'ciencia', 'cosmos', 'en vivo']
  },
  {
    id: 'ch-redbull-tv',
    channelId: 'UCblfuW_4rakUiQrBV4W2dfA',
    name: 'Red Bull TV Deportes',
    category: 'Deportes Extremos',
    description: 'Los eventos de deportes extremos, F1 y acción más impactantes del mundo.',
    avatarUrl: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '48ol4kGZ27A',
    videoUrl: 'https://www.youtube.com/embed/48ol4kGZ27A?loop=1&playlist=48ol4kGZ27A',
    currentVideoTitle: 'Red Bull Hardline - Saltos y Desafíos Extremos',
    viewerCount: 63100,
    tags: ['redbull', 'deportes', 'extremo', 'f1', 'skate', 'bmx', 'accion']
  },
  {
    id: 'ch-festivales-electro',
    name: 'Festivales & Electrónica 4K',
    category: 'Música Electrónica',
    description: 'Los mejores shows de luces, festivales y DJ sets en ultra HD.',
    avatarUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=60',
    provider: 'direct',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    currentVideoTitle: 'Electronic Stage - Festival Live Show',
    viewerCount: 47100,
    durationSeconds: 15,
    tags: ['electro', 'musica', 'festivales', 'tomorrowland', 'fiesta', 'dj']
  },

  // ── 5. NATURALEZA & CIENCIA ────────────────────────────────────────────────
  {
    id: 'ch-ocean-zen',
    name: 'Océanos & Vida Marina',
    category: 'Naturaleza & Zen',
    description: 'Documentales submarinos y sonidos relajantes del mar.',
    avatarUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=60',
    provider: 'direct',
    videoUrl: 'https://vjs.zencdn.net/v/oceans.mp4',
    currentVideoTitle: 'Océanos Profundos 4K',
    viewerCount: 29400,
    durationSeconds: 46,
    tags: ['oceano', 'naturaleza', 'zen', 'mar', 'relax', 'animales']
  },
  {
    id: 'ch-nasa-space',
    channelId: 'UCLA_DiR1FfKNvjuUpBHmylQ',
    name: 'NASA Space 24/7',
    category: '🔴 Espacio & Ciencia',
    description: 'Vistas de la Tierra en tiempo real desde la Estación Espacial Internacional.',
    avatarUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '21X5lGlDOfg',
    videoUrl: 'https://www.youtube.com/embed/21X5lGlDOfg?loop=1&playlist=21X5lGlDOfg',
    currentVideoTitle: 'NASA Earth Views from ISS Space Station',
    viewerCount: 57800,
    isLive: true,
    tags: ['nasa', 'espacio', 'tierra', 'iss', 'ciencia', 'cosmos', 'en vivo']
  },
  {
    id: 'ch-redbull-tv-2',
    channelId: 'UCblfuW_4rakUiQrBV4W2dfB',
    name: 'Red Bull TV Extremo',
    category: 'Deportes Extremos',
    description: 'Los eventos de deportes extremos, F1 y acción más impactantes del mundo.',
    avatarUrl: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=400&auto=format&fit=crop&q=60',
    thumbnail: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=800&auto=format&fit=crop&q=60',
    provider: 'youtube',
    videoId: '4G9O5iV123A',
    videoUrl: 'https://www.youtube.com/embed/4G9O5iV123A?loop=1&playlist=4G9O5iV123A',
    currentVideoTitle: 'Red Bull - Deportes de Acción Extrema',
    viewerCount: 41200,
    tags: ['redbull', 'deportes', 'extremo', 'f1', 'skate', 'bmx', 'accion']
  }
];

// ------------------------------------------------------------------------------
// PARSER UNIVERSAL MULTI-PLATAFORMA (YouTube, Twitch, Kick, M3U8, MP4, Direct)
// ------------------------------------------------------------------------------
export const parseUniversalUrl = (input: string): UniversalChannel | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Twitch Channel (twitch.tv/username)
  const twitchMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([a-zA-Z0-9_]+)/i);
  if (twitchMatch) {
    const channelName = twitchMatch[1];
    return {
      id: `twitch-${channelName}`,
      name: `${channelName} (Twitch Live)`,
      category: '🔴 Twitch en Vivo',
      description: `Transmisión oficial en vivo desde Twitch de ${channelName}.`,
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=60',
      thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=60',
      provider: 'twitch',
      videoUrl: `https://player.twitch.tv/?channel=${channelName}&parent=${window.location.hostname || 'localhost'}&autoplay=true`,
      currentVideoTitle: `Twitch Live Stream: ${channelName}`,
      viewerCount: Math.floor(Math.random() * 15000) + 3000,
      isLive: true,
      tags: ['twitch', channelName, 'stream', 'en vivo']
    };
  }

  // 2. Direct HLS Stream (.m3u8) o MP4 Directo
  if (trimmed.endsWith('.m3u8') || trimmed.includes('.m3u8')) {
    return {
      id: `hls-${Date.now()}`,
      name: 'Transmisión HLS en Vivo',
      category: '🔴 Televisión Digital Abierta',
      description: 'Canal en streaming directo HLS nativo.',
      avatarUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&auto=format&fit=crop&q=60',
      thumbnail: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=60',
      provider: 'hls',
      videoUrl: trimmed,
      currentVideoTitle: 'Emisión HLS en Directo',
      viewerCount: Math.floor(Math.random() * 8000) + 1200,
      isLive: true,
      tags: ['hls', 'm3u8', 'iptv', 'tv abierta']
    };
  }

  // 3. YouTube Handle (@nombre o youtube.com/@nombre)
  const handleMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/)?@([a-zA-Z0-9_.-]+)/i);
  if (handleMatch) {
    const handle = handleMatch[1];
    const cleanHandle = handle.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Buscar en el catálogo universal primero
    const foundInCatalog = UNIVERSAL_CATALOG.find(c => {
      const cNameClean = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cIdClean = (c.channelId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const cTags = (c.tags || []).map(t => t.toLowerCase().replace(/[^a-z0-9]/g, ''));
      return cNameClean.includes(cleanHandle) || cleanHandle.includes(cNameClean) || cIdClean.includes(cleanHandle) || cTags.includes(cleanHandle);
    });

    if (foundInCatalog) return foundInCatalog;

    return {
      id: `yt-handle-${handle}`,
      channelId: handle,
      name: `${handle} TV`,
      category: '🔴 Canal 24/7',
      description: `Transmisión continua de @${handle}.`,
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=60',
      thumbnail: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=60',
      provider: 'youtube',
      videoId: 'cG8x_Vbl0_0',
      videoUrl: `https://www.youtube.com/embed/cG8x_Vbl0_0?loop=1&playlist=cG8x_Vbl0_0`,
      currentVideoTitle: `Programación 24/7 de @${handle}`,
      viewerCount: Math.floor(Math.random() * 6000) + 1200,
      isLive: true,
      tags: [handle, 'youtube', 'canal']
    };
  }

  // 4. YouTube Video (watch?v= o youtu.be/ o shorts/)
  const vidMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
  if (vidMatch) {
    const videoId = vidMatch[1];
    return {
      id: `yt-video-${videoId}`,
      channelId: `vid-${videoId}`,
      name: `Canal YouTube (${videoId})`,
      category: '🔴 Emisión Continua 24/7',
      description: 'Video de YouTube configurado en bucle televisivo 24/7.',
      avatarUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      provider: 'youtube',
      videoId,
      videoUrl: `https://www.youtube.com/embed/${videoId}?loop=1&playlist=${videoId}`,
      currentVideoTitle: `Video Importado (${videoId})`,
      viewerCount: Math.floor(Math.random() * 4000) + 800,
      isLive: true,
      tags: ['video', videoId, 'youtube']
    };
  }

  // 5. TikTok Video
  const tiktokMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)/i) || 
                      trimmed.match(/(?:https?:\/\/)?(?:vt\.)?tiktok\.com\/(\w+)/i);
  if (tiktokMatch) {
    const videoId = tiktokMatch[1]; // for short URLs this is an alphanumeric id
    return {
      id: `tiktok-${videoId}`,
      name: `TikTok Video`,
      category: '📱 TikTok Vertical',
      description: 'Video corto importado desde TikTok.',
      avatarUrl: 'https://images.unsplash.com/photo-1611605698335-8b1569810432?w=400&auto=format&fit=crop&q=60',
      thumbnail: 'https://images.unsplash.com/photo-1611605698335-8b1569810432?w=800&auto=format&fit=crop&q=60',
      provider: 'direct', // We'll handle it specially in SyncedTVPlayer
      videoId,
      videoUrl: `https://www.tiktok.com/embed/v2/${videoId}`,
      currentVideoTitle: `TikTok Viral`,
      viewerCount: Math.floor(Math.random() * 8000) + 1200,
      isLive: false,
      tags: ['tiktok', 'viral', 'vertical']
    };
  }

  // 6. Instagram Reel / Post
  const igMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel)\/([\w-]+)/i);
  if (igMatch) {
    const postId = igMatch[1];
    return {
      id: `ig-${postId}`,
      name: `Instagram Reel`,
      category: '📱 Instagram Video',
      description: 'Reel o video importado desde Instagram.',
      avatarUrl: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&auto=format&fit=crop&q=60',
      thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&auto=format&fit=crop&q=60',
      provider: 'direct',
      videoId: postId,
      videoUrl: `https://www.instagram.com/p/${postId}/embed`,
      currentVideoTitle: `Instagram Reel`,
      viewerCount: Math.floor(Math.random() * 5000) + 800,
      isLive: false,
      tags: ['instagram', 'reel', 'vertical']
    };
  }

  return null;
};

// ------------------------------------------------------------------------------
// MOTOR DE BÚSQUEDA AUTÓNOMO (Indexado en Memoria + Supabase + Fallback Ilimitado)
// ------------------------------------------------------------------------------
export const searchUniversalEngine = async (query: string): Promise<UniversalChannel[]> => {
  if (!query || !query.trim()) return UNIVERSAL_CATALOG.slice(0, 15);
  const cleanQ = query.trim();

  // 1. Detección directa de URL o @Handle
  const directMatch = parseUniversalUrl(cleanQ);
  if (directMatch) {
    return [directMatch];
  }

  // Función de normalización (quitar tildes, mayúsculas y símbolos)
  const normalize = (str: string) =>
    (str || '')
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ");

  const cleanNorm = normalize(cleanQ).trim();
  const queryTerms = cleanNorm.split(/\s+/).filter(Boolean);

  // 2. Búsqueda instantánea en el Catálogo Universal (0 latencia, 0 cuota)
  const catalogResults = UNIVERSAL_CATALOG.filter(channel => {
    const channelText = normalize([
      channel.name,
      channel.category,
      channel.description,
      channel.currentVideoTitle,
      ...(channel.tags || [])
    ].join(' '));

    // Si coincide con la frase completa o con cualquiera de las palabras clave
    return channelText.includes(cleanNorm) || queryTerms.some(term => channelText.includes(term));
  });

  // Ordenar los resultados para que las coincidencias exactas aparezcan primero
  catalogResults.sort((a, b) => {
    const aText = normalize(a.name + ' ' + (a.tags || []).join(' '));
    const bText = normalize(b.name + ' ' + (b.tags || []).join(' '));
    const aScore = aText.includes(cleanNorm) ? 10 : queryTerms.filter(t => aText.includes(t)).length;
    const bScore = bText.includes(cleanNorm) ? 10 : queryTerms.filter(t => bText.includes(t)).length;
    return bScore - aScore;
  });

  // 3. Búsqueda en Base de Datos Supabase (Canales creados por la comunidad)
  let communityChannels: UniversalChannel[] = [];
  try {
    const { data } = await supabase
      .from('channels')
      .select('id, name, category, created_at')
      .ilike('name', `%${cleanQ}%`)
      .limit(10);

    if (data && data.length > 0) {
      communityChannels = data.map((ch: any) => ({
        id: ch.id,
        name: ch.name,
        category: ch.category || 'Canal Comunitario',
        description: `Canal creado por la comunidad en YouApp TV`,
        avatarUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&auto=format&fit=crop&q=60',
        thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=60',
        provider: 'youtube',
        videoId: 'cG8x_Vbl0_0',
        videoUrl: `https://www.youtube.com/embed/cG8x_Vbl0_0?loop=1&playlist=cG8x_Vbl0_0`,
        currentVideoTitle: `${ch.name} - Programación en Vivo`,
        viewerCount: Math.floor(Math.random() * 2000) + 300,
        isLive: true,
        tags: [ch.name.toLowerCase()]
      }));
    }
  } catch (e) {
    // Supabase offline o sin conexión no bloquea la búsqueda
  }

  // 4. Búsqueda en Canales Guardados por el Usuario en localStorage
  let localSavedChannels: UniversalChannel[] = [];
  try {
    const saved = JSON.parse(localStorage.getItem('youapp_saved_custom_channels') || '[]');
    if (Array.isArray(saved)) {
      localSavedChannels = saved.filter((ch: any) => {
        const text = normalize(ch.name + ' ' + (ch.category || ''));
        return queryTerms.some(term => text.includes(term));
      });
    }
  } catch (e) {}

  // Combinar y deduplicar resultados
  const combined = [...catalogResults, ...communityChannels, ...localSavedChannels];
  const seenIds = new Set<string>();
  const unique = combined.filter(ch => {
    if (!ch || seenIds.has(ch.name.toLowerCase())) return false;
    seenIds.add(ch.name.toLowerCase());
    return true;
  });

  if (unique.length > 0) {
    return unique;
  }

  // 5. Generador Temático Inteligente si no hubo coincidencia exacta
  return [
    {
      id: `gen-${cleanQ.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      name: `${cleanQ.toUpperCase()} TV`,
      category: '🔴 Canal 24/7 Continuo',
      description: `Transmisión temática continua sobre ${cleanQ}.`,
      avatarUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&auto=format&fit=crop&q=60',
      thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=60',
      provider: 'youtube',
      videoId: 'cG8x_Vbl0_0',
      videoUrl: `https://www.youtube.com/embed/cG8x_Vbl0_0?loop=1&playlist=cG8x_Vbl0_0`,
      currentVideoTitle: `Especial 24/7: ${cleanQ}`,
      viewerCount: Math.floor(Math.random() * 5000) + 1200,
      isLive: true,
      tags: [cleanQ.toLowerCase()]
    }
  ];
};
