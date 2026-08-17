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

// Canales 24/7 Oficiales en Vivo Verificados de YouTube (Transmisión Real Continua)
export const VERIFIED_24_7_LIVE_CHANNELS = [
  {
    id: 'live-lofi-girl',
    name: 'Lofi Girl 24/7 Radio',
    category: 'Focus & Música',
    viewerCount: 28400,
    videoUrl: 'https://www.youtube.com/embed/jfKfPfyJRdk',
    currentVideoTitle: 'lofi hip hop radio - beats to relax/study to 🔴 EN VIVO 24/7',
    thumbnail: 'https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    author: 'Lofi Girl'
  },
  {
    id: 'live-chillhop',
    name: 'Chillhop Radio 24/7',
    category: 'Relax & Chill',
    viewerCount: 9200,
    videoUrl: 'https://www.youtube.com/embed/5yx6BWlEVcY',
    currentVideoTitle: 'Chillhop Radio - jazzy & lofi hip hop beats 🔴 EN VIVO 24/7',
    thumbnail: 'https://img.youtube.com/vi/5yx6BWlEVcY/hqdefault.jpg',
    author: 'Chillhop Music'
  },
  {
    id: 'live-nasa',
    name: 'NASA Earth & Space 24/7',
    category: 'Ciencia & Cosmos',
    viewerCount: 14500,
    videoUrl: 'https://www.youtube.com/embed/21X5lGlDOfg',
    currentVideoTitle: 'NASA Live: Earth Views from the Space Station 🔴 EN VIVO 24/7',
    thumbnail: 'https://img.youtube.com/vi/21X5lGlDOfg/hqdefault.jpg',
    author: 'NASA'
  },
  {
    id: 'live-france24',
    name: 'France 24 Español 24/7',
    category: 'Noticias & Mundo',
    viewerCount: 18300,
    videoUrl: 'https://www.youtube.com/embed/aY_iWw3D1Z0',
    currentVideoTitle: 'France 24 Español - En directo las 24 horas 🔴 EN VIVO',
    thumbnail: 'https://img.youtube.com/vi/aY_iWw3D1Z0/hqdefault.jpg',
    author: 'FRANCE 24 Español'
  },
  {
    id: 'live-nature',
    name: 'Animal & Nature Cam 24/7',
    category: 'Naturaleza 4K',
    viewerCount: 6700,
    videoUrl: 'https://www.youtube.com/embed/4xDzrJKXOOY',
    currentVideoTitle: 'Relaxing 4K Nature & Ocean Live Stream 🔴 EN VIVO 24/7',
    thumbnail: 'https://img.youtube.com/vi/4xDzrJKXOOY/hqdefault.jpg',
    author: 'Nature Relaxation'
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

// Genera una grilla televisiva completa (20 a 30 videos continuos) a partir de un Canal Real de YouTube
export const fetchChannelTVVideos = async (channelId: string, channelTitle: string) => {
  if (!YOUTUBE_API_KEY || !channelId) return [];

  const cacheKey = `youapp_channel_videos_${channelId}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) {}

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=30&order=date&type=video&videoEmbeddable=true&key=${YOUTUBE_API_KEY}`
    );
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      // Fallback a los más vistos si por fecha está vacío
      const fallbackResp = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=30&order=viewCount&type=video&videoEmbeddable=true&key=${YOUTUBE_API_KEY}`
      );
      const fallbackData = await fallbackResp.json();
      if (!fallbackData.items) return [];
      data.items = fallbackData.items;
    }

    const formatted = data.items
      .filter((item: any) => item.id?.videoId)
      .map((item: any, idx: number) => ({
        id: `yt-ch-${channelId}-${item.id.videoId}`,
        name: `${channelTitle} TV`,
        category: 'Creador Oficial',
        viewerCount: Math.floor(Math.random() * 3000) + 500,
        videoUrl: `https://www.youtube.com/embed/${item.id.videoId}`,
        currentVideoTitle: item.snippet.title,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
        author: channelTitle,
        avatarUrl: item.snippet.thumbnails?.default?.url,
        episodeIndex: idx + 1
      }));

    try {
      localStorage.setItem(cacheKey, JSON.stringify(formatted));
    } catch (e) {}

    return formatted;
  } catch (err) {
    console.error("Error fetching channel TV videos:", err);
    return [];
  }
};

