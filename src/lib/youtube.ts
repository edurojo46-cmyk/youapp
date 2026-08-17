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

// Obtiene los 30 videos más vistos y reproducibles de YouTube para un estado de ánimo o temática
export const fetchTopViewedVideosByMood = async (query: string, maxResults = 30) => {
  if (!YOUTUBE_API_KEY) return [];

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

    if (!data.items || data.items.length === 0) return [];

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
    return [];
  }
};
