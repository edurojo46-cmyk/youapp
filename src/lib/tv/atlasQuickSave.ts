import { useStore } from '../../store/useStore';
import {
  loadYouMusicWorkspace,
  saveYouMusicWorkspace
} from './youMusicPlaylistStore';
import {
  loadLecturasWorkspace,
  saveLecturasWorkspace
} from './youLecturasStore';

export type AtlasQuickCategory = 'music' | 'tv' | 'lectura';

export interface AtlasQuickSaveInput {
  id: string;
  videoId?: string;
  title: string;
  author?: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  provider?: string;
  /** Pista opcional del origen (ej. 'music' si viene de YouMusic) */
  sourceHint?: AtlasQuickCategory;
}

const MUSIC_PATTERNS =
  /\b(official\s*video|official\s*audio|audio\s*oficial|video\s*oficial|lyrics?|letra|vevo|topic|album|álbum|remix|acoustic|acústico|unplugged|concert|concierto|session|sessions|tiny\s*desk|bzrp|ft\.|feat\.|music|música|canción|cancion|song|tango|rock|jazz|cumbia|folklore|folclore|symphony|sinfonía|piano|guitar|guitarra|dj\s*set|lofi|lo-fi|soundtrack|bso|ost|playlist|radio|balada|bolero|salsa|bachata|reggae|blues|indie|pop|hip\s*hop|rap|trap)\b/i;

export function classifyAtlasCategory(item: AtlasQuickSaveInput): AtlasQuickCategory {
  if (item.sourceHint === 'music') return 'music';
  if (item.sourceHint === 'lectura') return 'lectura';

  const haystack = `${item.title || ''} ${item.author || ''}`.trim();
  if (MUSIC_PATTERNS.test(haystack)) {
    return 'music';
  }

  const url = (item.sourceUrl || '').toLowerCase();
  const isVideoHost =
    /youtube\.com|youtu\.be|vimeo\.com|archive\.org|dailymotion\.com|twitch\.tv|peertube|odysee/i.test(
      url
    ) || Boolean(item.videoId);
  if (url && !isVideoHost && /^https?:\/\//.test(url)) {
    return 'lectura';
  }

  return 'tv';
}

export function getAtlasCategoryLabel(cat: AtlasQuickCategory): string {
  if (cat === 'music') return 'Música';
  if (cat === 'lectura') return 'Lecturas';
  return 'TV';
}

function extractCleanYtId(item: AtlasQuickSaveInput): string {
  if (item.videoId && /^[A-Za-z0-9_-]{11}$/.test(item.videoId)) return item.videoId;
  const m = (item.sourceUrl || '').match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m?.[1] || item.videoId || item.id;
}

export function isAtlasQuickSaved(item: AtlasQuickSaveInput | null | undefined): boolean {
  if (!item || (!item.id && !item.videoId)) return false;
  const vid = extractCleanYtId(item);

  // 1. Revisar YouMusic
  try {
    const musicWs = loadYouMusicWorkspace();
    for (const pl of musicWs.playlists) {
      if (pl.items.some((x) => x.videoId === vid || x.id === item.id)) return true;
    }
  } catch {
    // ignore
  }

  // 2. Revisar TV / Videos (useStore.savedContent)
  try {
    const saved = useStore.getState().savedContent || [];
    if (saved.some((s) => s.id === vid || s.id === item.id)) return true;
  } catch {
    // ignore
  }

  // 3. Revisar Lecturas
  try {
    const lectWs = loadLecturasWorkspace();
    if (
      item.sourceUrl &&
      lectWs.items.some((l) => l.url === item.sourceUrl || l.id === item.id)
    ) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

export function toggleAtlasQuickSave(item: AtlasQuickSaveInput): {
  saved: boolean;
  category: AtlasQuickCategory;
  label: string;
} {
  const category = classifyAtlasCategory(item);
  const label = getAtlasCategoryLabel(category);
  const vid = extractCleanYtId(item);
  const alreadySaved = isAtlasQuickSaved(item);

  if (alreadySaved) {
    // Quitar de cualquiera de las 3 bóvedas donde esté
    try {
      const musicWs = loadYouMusicWorkspace();
      let musicChanged = false;
      const nextPlaylists = musicWs.playlists.map((pl) => {
        const filtered = pl.items.filter((x) => x.videoId !== vid && x.id !== item.id);
        if (filtered.length !== pl.items.length) musicChanged = true;
        return { ...pl, items: filtered };
      });
      if (musicChanged) {
        saveYouMusicWorkspace({ ...musicWs, playlists: nextPlaylists });
      }
    } catch {
      // ignore
    }

    try {
      const st = useStore.getState();
      st.unsaveContent(vid);
      if (item.id && item.id !== vid) st.unsaveContent(item.id);
    } catch {
      // ignore
    }

    try {
      const lectWs = loadLecturasWorkspace();
      const filtered = lectWs.items.filter(
        (l) => l.id !== item.id && (!item.sourceUrl || l.url !== item.sourceUrl)
      );
      if (filtered.length !== lectWs.items.length) {
        saveLecturasWorkspace({ ...lectWs, items: filtered });
      }
    } catch {
      // ignore
    }

    return { saved: false, category, label };
  }

  // Guardar automáticamente en la sección que ATLAS clasificó
  if (category === 'music') {
    const ws = loadYouMusicWorkspace();
    const targetPl =
      ws.playlists.find((p) => p.id === ws.activePlaylistId) || ws.playlists[0];
    if (targetPl) {
      const newEntry = {
        id: `ym_${vid}_${Date.now().toString(36)}`,
        videoId: vid,
        title: item.title || 'Canción guardada',
        author: item.author || 'YouMusic',
        thumbnailUrl:
          item.thumbnailUrl ||
          (/^[A-Za-z0-9_-]{11}$/.test(vid)
            ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
            : ''),
        sourceUrl:
          item.sourceUrl ||
          (/^[A-Za-z0-9_-]{11}$/.test(vid) ? `https://www.youtube.com/watch?v=${vid}` : ''),
        addedAt: new Date().toISOString()
      };
      const updated = {
        ...ws,
        playlists: ws.playlists.map((pl) =>
          pl.id === targetPl.id
            ? {
                ...pl,
                items: [newEntry, ...pl.items.filter((x) => x.videoId !== vid)],
                updatedAt: new Date().toISOString()
              }
            : pl
        )
      };
      saveYouMusicWorkspace(updated);
    }
    return { saved: true, category, label };
  }

  if (category === 'lectura' && item.sourceUrl) {
    const lectWs = loadLecturasWorkspace();
    const domain = (() => {
      try {
        return new URL(item.sourceUrl!).hostname.replace(/^www\./, '');
      } catch {
        return 'Web';
      }
    })();
    const newLectura = {
      id: `lec_${Date.now().toString(36)}`,
      url: item.sourceUrl,
      title: item.title || item.sourceUrl,
      sourceName: item.author || domain,
      excerpt: '',
      imageUrl: item.thumbnailUrl,
      category: 'General',
      addedAt: new Date().toISOString(),
      read: false
    };
    saveLecturasWorkspace({
      ...lectWs,
      items: [newLectura, ...lectWs.items.filter((l) => l.url !== item.sourceUrl)]
    });
    return { saved: true, category, label };
  }

  // TV / Videos -> Mis Listas (useStore.savedContent)
  useStore.getState().saveContent({
    id: vid,
    type: 'video',
    title: item.title || 'Video guardado',
    provider: item.provider || 'youtube',
    savedAt: new Date().toISOString()
  });

  return { saved: true, category, label };
}
