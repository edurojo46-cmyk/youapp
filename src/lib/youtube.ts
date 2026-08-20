const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

// Convierte duración ISO 8601 (ej. PT1H2M30S) a segundos y string legible (ej. "01:02:30")
export const parseDuration = (isoDuration?: string): { seconds: number; formatted: string } => {
  if (!isoDuration) return { seconds: 300, formatted: '05:00' };
  
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = isoDuration.match(regex);
  
  if (!matches) return { seconds: 300, formatted: '05:00' };
  
  const hours = parseInt(matches[1] || '0', 10);
  const minutes = parseInt(matches[2] || '0', 10);
  const seconds = parseInt(matches[3] || '0', 10);
  
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  
  const formatted = hours > 0 
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
  return { seconds: totalSeconds, formatted };
};

// Extrae el ID de una playlist de YouTube a partir de una URL o texto
export const extractPlaylistId = (urlOrId: string): string | null => {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  
  // Si ya es un ID directo
  if (/^[A-Za-z0-9_-]{13,}$/.test(trimmed) && (trimmed.startsWith('PL') || trimmed.startsWith('UU') || trimmed.startsWith('FL') || trimmed.startsWith('RD'))) {
    return trimmed;
  }
  
  const match = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
};

// Extrae el ID de un video de YouTube
export const extractVideoId = (urlOrId: string): string | null => {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
};

// Obtiene los detalles de duración de una lista de video IDs
const fetchVideoDurations = async (videoIds: string[]): Promise<Record<string, { seconds: number; formatted: string }>> => {
  if (!YOUTUBE_API_KEY || videoIds.length === 0) return {};
  
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds.join(',')}&key=${YOUTUBE_API_KEY}`
    );
    const data = await res.json();
    const map: Record<string, { seconds: number; formatted: string }> = {};
    
    if (data.items) {
      for (const item of data.items) {
        map[item.id] = parseDuration(item.contentDetails?.duration);
      }
    }
    return map;
  } catch (e) {
    console.error("Error fetching video details:", e);
    return {};
  }
};

export const searchYouTube = async (query: string) => {
  if (!YOUTUBE_API_KEY) {
    console.warn("No YouTube API Key found, using mock results");
    return [
      {
        id: 'yt-1',
        provider: 'youtube',
        videoId: 'sO3NlF8yNqE',
        title: `(MOCK) Resultado para: ${query} - Parte 1`,
        author: 'Canal Demo',
        duration: '10 min',
        durationSeconds: 600,
        thumbnail: 'https://img.youtube.com/vi/sO3NlF8yNqE/maxresdefault.jpg'
      }
    ];
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`
    );
    const data = await response.json();

    if (!data.items) return [];

    const videoIds = data.items.map((item: any) => item.id.videoId).filter(Boolean);
    const durations = await fetchVideoDurations(videoIds);

    return data.items.map((item: any) => {
      const vId = item.id.videoId;
      const dur = durations[vId] || { seconds: 300, formatted: '05:00' };
      return {
        id: `yt-${vId}`,
        provider: 'youtube',
        videoId: vId,
        title: item.snippet.title,
        author: item.snippet.channelTitle,
        duration: dur.formatted,
        durationSeconds: dur.seconds,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url
      };
    });
  } catch (error) {
    console.error("Error fetching from YouTube API:", error);
    return [];
  }
};

// Importa una Playlist completa de YouTube
export const fetchPlaylistVideos = async (playlistId: string) => {
  if (!YOUTUBE_API_KEY) {
    throw new Error("No hay YouTube API Key configurada");
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${YOUTUBE_API_KEY}`
    );
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || "Error al obtener la playlist");
    }

    if (!data.items || data.items.length === 0) {
      return [];
    }

    const videoIds = data.items
      .map((item: any) => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId)
      .filter(Boolean);

    const durations = await fetchVideoDurations(videoIds);

    return data.items
      .filter((item: any) => {
        const title = item.snippet?.title;
        return title !== "Private video" && title !== "Deleted video";
      })
      .map((item: any) => {
        const vId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
        const dur = durations[vId] || { seconds: 300, formatted: '05:00' };
        return {
          id: `yt-${vId}`,
          provider: 'youtube',
          videoId: vId,
          title: item.snippet.title,
          author: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle,
          duration: dur.formatted,
          durationSeconds: dur.seconds,
          thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url
        };
      });
  } catch (error: any) {
    console.error("Error en fetchPlaylistVideos:", error);
    throw error;
  }
};

// Canales de Transmisión Sincronizada 24/7 Nativa (100% CORS Libre, Ultra-Rápidos y Compatibles con TV, Chromecast y Celular)
export const VERIFIED_24_7_LIVE_CHANNELS = [
  {
    id: 'ch-01-cinema-4k',
    name: 'Cine & Animación 4K 24/7',
    category: 'Cine & Animación',
    viewerCount: 28400,
    videoUrl: 'https://playertest.longtailvideo.com/adaptive/big_buck_bunny/big_buck_bunny.m3u8',
    currentVideoTitle: 'Big Buck Bunny - Película 4K HLS',
    thumbnail: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=60',
    author: 'Blender Foundation',
    durationSeconds: 600
  },
  {
    id: 'ch-02-nature-relax',
    name: 'Naturaleza & Paisajes 24/7',
    category: 'Relax & Naturaleza',
    viewerCount: 34100,
    videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    currentVideoTitle: 'Escapes Naturales - Sintel HLS Stream',
    thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=60',
    author: 'Earth TV',
    durationSeconds: 900
  },
  {
    id: 'ch-03-scifi-cosmos',
    name: 'Cosmos & Sci-Fi 24/7',
    category: 'Ciencia & Futuro',
    viewerCount: 19800,
    videoUrl: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    currentVideoTitle: 'Tears of Steel - Ciencia Ficción & Futuro HLS',
    thumbnail: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=60',
    author: 'Sci-Fi Cosmos',
    durationSeconds: 734
  },
  {
    id: 'ch-04-big-buck-bunny',
    name: 'Big Buck Bunny Especial HD',
    category: 'Animación & Familiar',
    viewerCount: 42300,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    currentVideoTitle: 'Big Buck Bunny - Película Completa HD',
    thumbnail: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800&auto=format&fit=crop&q=60',
    author: 'Animation Studio',
    durationSeconds: 596
  },
  {
    id: 'ch-05-elephants-dream',
    name: 'Elephants Dream 4K',
    category: 'Cine & Animación',
    viewerCount: 38900,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    currentVideoTitle: 'Elephants Dream - Obra Maestra Digital',
    thumbnail: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60',
    author: 'Blender Cinema',
    durationSeconds: 653
  },
  {
    id: 'ch-06-for-bigger-blazes',
    name: 'Festivales & Electrónica 4K',
    category: 'Música & Festivales',
    viewerCount: 51200,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    currentVideoTitle: 'Show de Luces, Fuego y Electrónica',
    thumbnail: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=60',
    author: 'Electro Stage',
    durationSeconds: 60
  },
  {
    id: 'ch-07-for-bigger-escapes',
    name: 'Escapes & Aventura Global',
    category: 'Viajes & Aventura',
    viewerCount: 26700,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    currentVideoTitle: 'Aventuras Al Límite - Paisajes y Montañas',
    thumbnail: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop&q=60',
    author: 'Adventure World',
    durationSeconds: 60
  },
  {
    id: 'ch-08-for-bigger-fun',
    name: 'Humor & Entretenimiento 24/7',
    category: 'Humor & Viral',
    viewerCount: 18400,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    currentVideoTitle: 'Risas y Momentos Divertidos 24/7',
    thumbnail: 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=800&auto=format&fit=crop&q=60',
    author: 'Fun Network',
    durationSeconds: 60
  },
  {
    id: 'ch-09-for-bigger-joy',
    name: 'Espectáculos & Arte Visual',
    category: 'Arte & Cultura',
    viewerCount: 31000,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4',
    currentVideoTitle: 'Colores, Fuego y Arte en Alta Definición',
    thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=60',
    author: 'Visual Arts',
    durationSeconds: 60
  },
  {
    id: 'ch-10-tears-of-steel-hd',
    name: 'Tears of Steel HD Cinema',
    category: 'Ciencia Ficción',
    viewerCount: 47000,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    currentVideoTitle: 'Tears of Steel - Efectos Visuales 4K',
    thumbnail: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=60',
    author: 'VFX Cinema',
    durationSeconds: 734
  },
  {
    id: 'ch-11-bullrun-motors',
    name: 'Motor & Supercars 24/7',
    category: 'Velocidad & Autos',
    viewerCount: 31200,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
    currentVideoTitle: 'Superdeportivos en Carretera',
    thumbnail: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=60',
    author: 'Supercars Live',
    durationSeconds: 60
  },
  {
    id: 'ch-12-oceans-action',
    name: 'Oceans & Acción Marina',
    category: 'Naturaleza & Deportes',
    viewerCount: 16500,
    videoUrl: 'https://vjs.zencdn.net/v/oceans.mp4',
    currentVideoTitle: 'Océanos Profundos 4K',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=60',
    author: 'Ocean World',
    durationSeconds: 46
  },
  {
    id: 'ch-13-sintel-trailer',
    name: 'Sintel - Cine de Animación HD',
    category: 'Cine & Cortos',
    viewerCount: 21900,
    videoUrl: 'https://media.w3.org/2010/05/sintel/trailer_hd.mp4',
    currentVideoTitle: 'Sintel - Historia Épica',
    thumbnail: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=800&auto=format&fit=crop&q=60',
    author: 'Open Movies',
    durationSeconds: 52
  },
  {
    id: 'ch-14-tech-future-hls',
    name: 'Tecnología & IA TV (HLS)',
    category: 'Tecnología & IA',
    viewerCount: 18400,
    videoUrl: 'https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8',
    currentVideoTitle: 'Transmisión HD Ultra Rápida - Tecnología & Futuro',
    thumbnail: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=60',
    author: 'Tech Stream',
    durationSeconds: 900
  },
  {
    id: 'ch-15-mux-stream-hls',
    name: 'Mux Ultra Live HD (HLS)',
    category: 'Ciencia & Streaming',
    viewerCount: 25400,
    videoUrl: 'https://test-streams.mux.dev/test_001/stream.m3u8',
    currentVideoTitle: 'Transmisión de Prueba Mux HD Multi-Bitrate',
    thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&auto=format&fit=crop&q=60',
    author: 'Mux Broadcast',
    durationSeconds: 900
  }
];





// Busca Transmisiones Reales en Vivo 24/7 activas en YouTube (eventType=live)
export const fetchReal24_7LiveStreams = async (query: string, maxResults = 15) => {
  if (!YOUTUBE_API_KEY) return VERIFIED_24_7_LIVE_CHANNELS;

  const cacheKey = `youapp_live_streams_${query}_${maxResults}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.length > 0) return parsed;
    }
  } catch (e) {}

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&eventType=live&type=video&videoEmbeddable=true&maxResults=${maxResults}&order=viewCount&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`
    );
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return VERIFIED_24_7_LIVE_CHANNELS;
    }

    const formatted = data.items
      .filter((item: any) => item.id?.videoId)
      .map((item: any) => ({
        id: `live-${item.id.videoId}`,
        name: item.snippet.channelTitle || item.snippet.title,
        category: '🔴 EN VIVO 24/7',
        viewerCount: Math.floor(Math.random() * 8000) + 1500,
        videoUrl: `https://www.youtube.com/embed/${item.id.videoId}`,
        currentVideoTitle: item.snippet.title,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
        author: item.snippet.channelTitle
      }));

    try {
      localStorage.setItem(cacheKey, JSON.stringify(formatted));
    } catch (e) {}

    return formatted;
  } catch (err) {
    console.error("Error fetching live streams:", err);
    return VERIFIED_24_7_LIVE_CHANNELS;
  }
};

// Obtiene los videos más vistos y transmisiones en vivo de YouTube para una búsqueda
export const fetchTopViewedVideosByMood = async (query: string, maxResults = 30) => {
  if (!YOUTUBE_API_KEY) return VERIFIED_24_7_LIVE_CHANNELS;

  const cacheKey = `youapp_mood_v5_${query}_${maxResults}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.length > 0) return parsed;
    }
  } catch (e) {}

  try {
    // 1. Buscar si hay transmisiones EN VIVO activas para esta búsqueda
    let liveStreams: any[] = [];
    try {
      const liveRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&eventType=live&type=video&videoEmbeddable=true&maxResults=5&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`
      );
      const liveData = await liveRes.json();
      if (liveData.items && liveData.items.length > 0) {
        liveStreams = liveData.items
          .filter((item: any) => item.id?.videoId)
          .map((item: any) => ({
            id: `live-${item.id.videoId}`,
            name: `${item.snippet.channelTitle || item.snippet.title}`,
            category: '🔴 EN VIVO AHORA',
            viewerCount: Math.floor(Math.random() * 9000) + 2500,
            videoUrl: `https://www.youtube.com/embed/${item.id.videoId}`,
            currentVideoTitle: item.snippet.title,
            thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
            author: item.snippet.channelTitle,
            isLive: true
          }));
      }
    } catch (e) {}

    // 2. Buscar videos de duración completa (excluyendo Shorts)
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=${maxResults}&videoDuration=medium&order=relevance&type=video&videoEmbeddable=true&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`
    );
    const data = await response.json();
    let regularItems = data.items || [];

    if (regularItems.length === 0) {
      const fallbackResp = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=${maxResults}&order=viewCount&type=video&videoEmbeddable=true&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`
      );
      const fallbackData = await fallbackResp.json();
      regularItems = fallbackData.items || [];
    }

    const formattedRegular = regularItems
      .filter((item: any) => item.id?.videoId && !liveStreams.some((l: any) => l.id.includes(item.id.videoId)))
      .map((item: any) => ({
        id: `mood-${item.id.videoId}`,
        name: item.snippet.title,
        category: query,
        viewerCount: Math.floor(Math.random() * 2000) + 300,
        videoUrl: `https://www.youtube.com/embed/${item.id.videoId}`,
        currentVideoTitle: item.snippet.title,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
        author: item.snippet.channelTitle
      }));

    const combined = [...liveStreams, ...formattedRegular];

    if (combined.length === 0) return VERIFIED_24_7_LIVE_CHANNELS;

    try {
      localStorage.setItem(cacheKey, JSON.stringify(combined));
    } catch (e) {}

    return combined;
  } catch (err) {
    console.error("Error fetching top viewed videos:", err);
    return VERIFIED_24_7_LIVE_CHANNELS;
  }
};



// Busca Canales Reales de YouTube por Nombre o Creador
export const searchRealYouTubeChannels = async (query: string) => {

  if (!YOUTUBE_API_KEY || !query.trim()) return [];

  const cacheKey = `youapp_yt_channels_${query.trim().toLowerCase()}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) {}

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=8&type=channel&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`
    );
    const data = await response.json();

    if (!data.items) return [];

    const channels = data.items.map((item: any) => ({
      id: item.id?.channelId || item.snippet?.channelId,
      channelId: item.id?.channelId || item.snippet?.channelId,
      name: item.snippet.title,
      description: item.snippet.description,
      avatarUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
      customUrl: item.snippet.customUrl || `@${item.snippet.title.replace(/\s+/g, '')}`
    }));

    try {
      localStorage.setItem(cacheKey, JSON.stringify(channels));
    } catch (e) {}

    return channels;
  } catch (err) {
    console.error("Error searching YouTube channels:", err);
    return [];
  }
};

// Genera una grilla televisiva completa (priorizando transmisiones en vivo y episodios completos)
export const fetchChannelTVVideos = async (channelId: string, channelTitle: string) => {
  if (!YOUTUBE_API_KEY || !channelId) return [];

  const cacheKey = `youapp_channel_videos_v4_${channelId}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) {}

  try {
    // 1. Primero verificar si el canal está emitiendo EN VIVO en este instante
    let liveItems: any[] = [];
    try {
      const liveResp = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${YOUTUBE_API_KEY}`
      );
      const liveData = await liveResp.json();
      if (liveData.items && liveData.items.length > 0) {
        liveItems = liveData.items;
      }
    } catch (e) {}

    // 2. Obtener videos de duración completa (excluyendo Shorts)
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=30&videoDuration=medium&order=date&type=video&videoEmbeddable=true&key=${YOUTUBE_API_KEY}`
    );
    const data = await response.json();
    let regularItems = data.items || [];

    // Fallback si medium está vacío
    if (regularItems.length === 0) {
      const fallbackResp = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=30&order=viewCount&type=video&videoEmbeddable=true&key=${YOUTUBE_API_KEY}`
      );
      const fallbackData = await fallbackResp.json();
      regularItems = fallbackData.items || [];
    }

    const allItems = [...liveItems, ...regularItems];

    const formatted = allItems
      .filter((item: any) => item.id?.videoId)
      .map((item: any, idx: number) => {
        const isLive = item.snippet?.liveBroadcastContent === 'live' || liveItems.some((l: any) => l.id?.videoId === item.id?.videoId);
        return {
          id: `yt-ch-${channelId}-${item.id.videoId}`,
          name: `${channelTitle} TV`,
          category: isLive ? '🔴 EN VIVO 24/7' : 'Programación Oficial',
          viewerCount: Math.floor(Math.random() * 3000) + 500,
          videoUrl: `https://www.youtube.com/embed/${item.id.videoId}`,
          currentVideoTitle: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
          author: channelTitle,
          avatarUrl: item.snippet.thumbnails?.default?.url,
          episodeIndex: idx + 1,
          isLive
        };
      });

    try {
      localStorage.setItem(cacheKey, JSON.stringify(formatted));
    } catch (e) {}

    return formatted;
  } catch (err) {
    console.error("Error fetching channel TV videos:", err);
    return [];
  }
};


