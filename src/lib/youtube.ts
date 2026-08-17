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

// Canales de Transmisión Sincronizada 24/7 Nativa (HTML5 Video & HLS sin restricciones de YouTube)
export const VERIFIED_24_7_LIVE_CHANNELS = [
  {
    id: 'live-cinema-blender',
    name: 'Cine & Animación 4K 24/7',
    category: 'Cine & Animación',
    viewerCount: 28400,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    currentVideoTitle: 'Big Buck Bunny - Película 4K 60fps',
    thumbnail: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=60',
    author: 'Blender Foundation',
    durationSeconds: 596
  },
  {
    id: 'live-nature-escape',
    name: 'Naturaleza & Paisajes 24/7',
    category: 'Relax & Naturaleza',
    viewerCount: 34100,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    currentVideoTitle: 'Escapes Naturales - Paisajes del Mundo en 4K',
    thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=60',
    author: 'Earth TV',
    durationSeconds: 300
  },
  {
    id: 'live-scifi-cosmos',
    name: 'Cosmos & Sci-Fi 24/7',
    category: 'Ciencia & Futuro',
    viewerCount: 19800,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    currentVideoTitle: 'Tears of Steel - Ciencia Ficción & Cosmos 4K',
    thumbnail: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=60',
    author: 'Sci-Fi Cosmos',
    durationSeconds: 734
  },
  {
    id: 'live-action-sports',
    name: 'Acción Extrema & Deportes 24/7',
    category: 'Deportes Extremos',
    viewerCount: 16500,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    currentVideoTitle: 'Adrenalina Pura - Deportes Extremos del Mundo',
    thumbnail: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=800&auto=format&fit=crop&q=60',
    author: 'Action World',
    durationSeconds: 300
  },
  {
    id: 'live-fantasy-adventure',
    name: 'Fantasía & Aventura 24/7',
    category: 'Cine & Aventura',
    viewerCount: 21900,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    currentVideoTitle: 'Sintel - La Búsqueda del Dragón en 4K',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=60',
    author: 'Open Movies',
    durationSeconds: 888
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

// Obtiene los 30 videos más vistos y reproducibles de YouTube para un estado de ánimo o temática
export const fetchTopViewedVideosByMood = async (query: string, maxResults = 30) => {
  if (!YOUTUBE_API_KEY) return VERIFIED_24_7_LIVE_CHANNELS;

  const cacheKey = `youapp_mood_v3_${query}_${maxResults}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.length > 0) return parsed;
    }
  } catch (e) {}

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=${maxResults}&order=viewCount&type=video&videoEmbeddable=true&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`
    );
    const data = await response.json();

    if (!data.items || data.items.length === 0) return VERIFIED_24_7_LIVE_CHANNELS;

    const formatted = data.items
      .filter((item: any) => item.id?.videoId)
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

    try {
      localStorage.setItem(cacheKey, JSON.stringify(formatted));
    } catch (e) {}

    return formatted;
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


