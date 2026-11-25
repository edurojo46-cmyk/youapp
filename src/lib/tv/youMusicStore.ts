// ============================================================================
// YOU MUSIC V1 — Biblioteca Musical Costo Externo US$0
// Reproductores oficiales (SoundCloud / Bandcamp) + Artistas Independientes
// Autorizados + Creative Commons / Radios verificadas. Cero scraping de YouTube.
// ============================================================================

const YOU_MUSIC_STORAGE_KEY = 'youapp_you_music_v1';

export type YouMusicProvider =
  | 'youtube_official'
  | 'dailymotion'
  | 'peertube'
  | 'openverse'
  | 'wikimedia'
  | 'soundcloud'
  | 'bandcamp'
  | 'spotify'
  | 'archive'
  | 'mixcloud'
  | 'audius'
  | 'jamendo'
  | 'audiomack'
  | 'direct_audio'
  | 'radio';

export type YouMusicLicense =
  | 'YOUTUBE_OFFICIAL_VIDEO'
  | 'DAILYMOTION_OFFICIAL'
  | 'PEERTUBE_OPEN'
  | 'OPENVERSE_CC'
  | 'WIKIMEDIA_COMMONS'
  | 'SOUNDCLOUD_OFFICIAL'
  | 'BANDCAMP_OFFICIAL'
  | 'SPOTIFY_OFFICIAL'
  | 'ARCHIVE_ORG_OFFICIAL'
  | 'MIXCLOUD_OFFICIAL'
  | 'AUDIUS_OFFICIAL'
  | 'JAMENDO_CC'
  | 'AUDIOMACK_OFFICIAL'
  | 'ARTIST_AUTHORIZED'
  | 'CREATIVE_COMMONS'
  | 'RADIO_LIVE';

export interface YouMusicTrack {
  id: string;
  title: string;
  artist: string;
  genre: string;
  provider: YouMusicProvider;
  license: YouMusicLicense;
  isAlbum?: boolean;
  sourceUrl: string;
  embedUrl?: string;
  originUrl?: string;
  coverColor: string;
  notes?: string;
  artistAuthorized: boolean;
  isFavorite: boolean;
  plays: number;
  addedAt: string;
}

export interface YouMusicState {
  tracks: YouMusicTrack[];
  playlists: { id: string; name: string; trackIds: string[] }[];
}

export interface ResolvedMusicInput {
  ok: boolean;
  error?: string;
  provider?: YouMusicProvider;
  license?: YouMusicLicense;
  isAlbum?: boolean;
  sourceUrl?: string;
  embedUrl?: string;
  originUrl?: string;
  suggestedTitle?: string;
  suggestedArtist?: string;
}

const COVER_PALETTE = [
  'linear-gradient(135deg, #0071e3 0%, #5ac8fa 100%)',
  'linear-gradient(135deg, #5856d6 0%, #af52de 100%)',
  'linear-gradient(135deg, #ff2d55 0%, #ff9500 100%)',
  'linear-gradient(135deg, #047857 0%, #34d399 100%)',
  'linear-gradient(135deg, #1d1d1f 0%, #515154 100%)'
];

export function pickCoverColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return COVER_PALETTE[Math.abs(hash) % COVER_PALETTE.length];
}

export function buildSoundCloudEmbedUrl(rawUrl: string, isAlbum = false): string {
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(
    rawUrl.trim()
  )}&color=%230071e3&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=${
    isAlbum ? 'false' : 'false'
  }`;
}

export function resolveYouMusicInput(rawInput: string): ResolvedMusicInput {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Pegá una URL de álbum o canción (SoundCloud, Spotify, Bandcamp, Internet Archive o audio autorizado).'
    };
  }

  // YOU MUSIC escala 100 % sin API de YouTube (videos de YouTube van en Mi Señal /misenal1)
  if (/(?:youtube\.com|youtu\.be)/i.test(trimmed)) {
    return {
      ok: false,
      error:
        'YOU MUSIC funciona sin API de YouTube. Para videos de YouTube usá tu señal en /misenal1; acá conectá SoundCloud, Bandcamp, Audiomack, Mixcloud, Internet Archive, Spotify o audio autorizado.'
    };
  }

  // 1a. Dailymotion oficial (US$0, sin cuota YouTube)
  const dmMatch = trimmed.match(
    /(?:dailymotion\.com\/(?:embed\/)?video\/|dai\.ly\/|geo\.dailymotion\.com\/player\.html\?[^#]*video=)([a-zA-Z0-9]+)/i
  );
  if (dmMatch && dmMatch[1]) {
    const dmId = dmMatch[1];
    const cleanUrl = `https://www.dailymotion.com/video/${dmId}`;
    return {
      ok: true,
      provider: 'dailymotion',
      license: 'DAILYMOTION_OFFICIAL',
      isAlbum: false,
      sourceUrl: cleanUrl,
      embedUrl: `https://geo.dailymotion.com/player.html?video=${dmId}&`,
      originUrl: cleanUrl,
      suggestedTitle: `Video musical Dailymotion (${dmId})`,
      suggestedArtist: 'Dailymotion'
    };
  }

  // 1. Spotify oficial embebible (álbum, canción, playlist o artista — US$0)
  const spMatch = trimmed.match(
    /https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(album|track|playlist|artist)\/([A-Za-z0-9]+)/i
  );
  if (spMatch) {
    const kind = spMatch[1].toLowerCase();
    const id = spMatch[2];
    const cleanUrl = `https://open.spotify.com/${kind}/${id}`;
    const isAlbum = kind === 'album' || kind === 'playlist' || kind === 'artist';
    return {
      ok: true,
      provider: 'spotify',
      license: 'SPOTIFY_OFFICIAL',
      isAlbum,
      sourceUrl: cleanUrl,
      embedUrl: `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator`,
      originUrl: cleanUrl,
      suggestedTitle:
        kind === 'album'
          ? 'Álbum en Spotify'
          : kind === 'playlist'
          ? 'Playlist en Spotify'
          : kind === 'artist'
          ? 'Artista en Spotify'
          : 'Canción en Spotify',
      suggestedArtist: 'Spotify Oficial'
    };
  }

  // 2. Internet Archive oficial embebible (álbum / colección / audio — US$0)
  const archMatch = trimmed.match(
    /https?:\/\/(?:www\.)?archive\.org\/(?:details|embed)\/([^/?#\s]+)/i
  );
  if (archMatch) {
    const itemId = archMatch[1];
    const cleanUrl = `https://archive.org/details/${itemId}`;
    return {
      ok: true,
      provider: 'archive',
      license: 'ARCHIVE_ORG_OFFICIAL',
      isAlbum: true,
      sourceUrl: cleanUrl,
      embedUrl: `https://archive.org/embed/${encodeURIComponent(itemId)}?playlist=1`,
      originUrl: cleanUrl,
      suggestedTitle: itemId.replace(/[-_]+/g, ' '),
      suggestedArtist: 'Internet Archive'
    };
  }

  // 2b. Mixcloud oficial embebible (programas musicales, sets largos, folklore/tango/DJ — 0 anuncios)
  const mixMatch = trimmed.match(
    /https?:\/\/(?:www\.)?mixcloud\.com\/([^/\s]+\/[^/?#\s]+)/i
  );
  if (mixMatch) {
    const feedPath = `/${mixMatch[1].replace(/\/+$/, '')}/`;
    const [userSlug, showSlug] = mixMatch[1].split('/');
    const cleanUrl = `https://www.mixcloud.com${feedPath}`;
    return {
      ok: true,
      provider: 'mixcloud',
      license: 'MIXCLOUD_OFFICIAL',
      isAlbum: false,
      sourceUrl: cleanUrl,
      embedUrl: `https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=1&feed=${encodeURIComponent(
        feedPath
      )}`,
      originUrl: cleanUrl,
      suggestedArtist: (userSlug || 'Mixcloud').replace(/[-_]+/g, ' '),
      suggestedTitle: (showSlug || 'Sesión en Mixcloud').replace(/[-_]+/g, ' ')
    };
  }

  // 2c. Jamendo oficial Creative Commons (track o álbum — 0 anuncios)
  const jamMatch = trimmed.match(
    /https?:\/\/(?:www\.)?jamendo\.com\/(track|album)\/(\d+)(?:\/([^/?#\s]+))?/i
  );
  if (jamMatch) {
    const kind = jamMatch[1].toLowerCase();
    const id = jamMatch[2];
    const slug = (jamMatch[3] || '').replace(/[-_]+/g, ' ');
    const cleanUrl = `https://www.jamendo.com/${kind}/${id}`;
    return {
      ok: true,
      provider: 'jamendo',
      license: 'JAMENDO_CC',
      isAlbum: kind === 'album',
      sourceUrl: cleanUrl,
      embedUrl: `https://www.jamendo.com/player/embed/${kind}/${id}`,
      originUrl: cleanUrl,
      suggestedTitle: slug || (kind === 'album' ? 'Álbum Creative Commons' : 'Tema Jamendo CC'),
      suggestedArtist: 'Jamendo Creative Commons'
    };
  }

  // 2d. Audius oficial (embed o enlace — 0 anuncios)
  const audEmbedMatch = trimmed.match(
    /https?:\/\/audius\.co\/embed\/[^\s"']+/i
  );
  if (audEmbedMatch) {
    return {
      ok: true,
      provider: 'audius',
      license: 'AUDIUS_OFFICIAL',
      isAlbum: /playlist|album/i.test(audEmbedMatch[0]),
      sourceUrl: audEmbedMatch[0],
      embedUrl: audEmbedMatch[0],
      originUrl: 'https://audius.co'
    };
  }
  const audUrlMatch = trimmed.match(
    /https?:\/\/(?:www\.)?audius\.co\/([^/\s]+)\/([^/?#\s]+)/i
  );
  if (audUrlMatch) {
    const cleanUrl = trimmed.split('?')[0];
    return {
      ok: true,
      provider: 'audius',
      license: 'AUDIUS_OFFICIAL',
      isAlbum: /playlist|album/i.test(cleanUrl),
      sourceUrl: cleanUrl,
      originUrl: cleanUrl,
      suggestedArtist: audUrlMatch[1].replace(/[-_]+/g, ' '),
      suggestedTitle: audUrlMatch[2].replace(/[-_]+/g, ' ')
    };
  }

  // 2e. Audiomack oficial (canción, álbum, playlist o embed — US$0)
  const amEmbedMatch = trimmed.match(
    /https?:\/\/(?:www\.)?audiomack\.com\/embed\/[^\s"']+/i
  );
  if (amEmbedMatch) {
    const embedUrl = amEmbedMatch[0];
    const isAlbum = /\/(album|playlist)\//i.test(embedUrl);
    return {
      ok: true,
      provider: 'audiomack',
      license: 'AUDIOMACK_OFFICIAL',
      isAlbum,
      sourceUrl: embedUrl,
      embedUrl,
      originUrl: embedUrl.replace('/embed/', '/')
    };
  }
  const amUrlMatch = trimmed.match(
    /https?:\/\/(?:www\.)?audiomack\.com\/([^/\s]+)\/(song|album|playlist)\/([^/?#\s]+)/i
  );
  if (amUrlMatch) {
    const artistSlug = amUrlMatch[1];
    const kind = amUrlMatch[2].toLowerCase();
    const itemSlug = amUrlMatch[3];
    const cleanUrl = `https://audiomack.com/${artistSlug}/${kind}/${itemSlug}`;
    const isAlbum = kind === 'album' || kind === 'playlist';
    return {
      ok: true,
      provider: 'audiomack',
      license: 'AUDIOMACK_OFFICIAL',
      isAlbum,
      sourceUrl: cleanUrl,
      embedUrl: `https://audiomack.com/embed/${artistSlug}/${kind}/${itemSlug}`,
      originUrl: cleanUrl,
      suggestedArtist: artistSlug.replace(/[-_]+/g, ' '),
      suggestedTitle: itemSlug.replace(/[-_]+/g, ' ')
    };
  }

  // 3. Código <iframe> oficial de Bandcamp o URL EmbeddedPlayer
  const bcIframeMatch = trimmed.match(
    /https?:\/\/bandcamp\.com\/EmbeddedPlayer\/[^\s"']+/i
  );
  if (bcIframeMatch) {
    const embedUrl = bcIframeMatch[0];
    const hrefMatch = trimmed.match(/href="(https?:\/\/[^"]+\.bandcamp\.com[^"]*)"/i);
    const isAlbum = /album=/i.test(embedUrl);
    return {
      ok: true,
      provider: 'bandcamp',
      license: 'BANDCAMP_OFFICIAL',
      isAlbum,
      sourceUrl: hrefMatch ? hrefMatch[1] : embedUrl,
      embedUrl,
      originUrl: hrefMatch ? hrefMatch[1] : 'https://bandcamp.com'
    };
  }

  // 4. URL pública de Bandcamp (álbum o track)
  if (/^https?:\/\/[^/]+\.bandcamp\.com\/(track|album)\//i.test(trimmed)) {
    const parts = trimmed.replace(/^https?:\/\//i, '').split('/');
    const sub = parts[0]?.split('.')[0] || 'Artista Bandcamp';
    const isAlbum = (parts[1] || '').toLowerCase() === 'album';
    const slug = (parts[2] || '').replace(/-/g, ' ');
    return {
      ok: true,
      provider: 'bandcamp',
      license: 'BANDCAMP_OFFICIAL',
      isAlbum,
      sourceUrl: trimmed,
      originUrl: trimmed,
      suggestedArtist: sub,
      suggestedTitle: slug || (isAlbum ? 'Álbum en Bandcamp' : 'Tema en Bandcamp')
    };
  }

  // 5. SoundCloud oficial (álbum /sets/, canción, perfil de artista, enlace corto on.soundcloud o iframe)
  const scIframeMatch = trimmed.match(
    /https?:\/\/w\.soundcloud\.com\/player\/\?[^\s"']+/i
  );
  if (scIframeMatch) {
    const isAlbum = /playlists|sets/i.test(scIframeMatch[0]);
    return {
      ok: true,
      provider: 'soundcloud',
      license: 'SOUNDCLOUD_OFFICIAL',
      isAlbum,
      sourceUrl: scIframeMatch[0],
      embedUrl: scIframeMatch[0],
      originUrl: 'https://soundcloud.com'
    };
  }
  if (/^https?:\/\/(?:www\.|m\.|on\.)?soundcloud\.com\/[^\s]+/i.test(trimmed)) {
    const cleanUrl = trimmed.split('?')[0].replace(/\/+$/, '');
    const pathPart = cleanUrl.replace(/^https?:\/\/(?:www\.|m\.|on\.)?soundcloud\.com\//i, '');
    const segs = pathPart.split('/').filter(Boolean);
    const isAlbum =
      segs.includes('sets') ||
      segs.includes('albums') ||
      segs.length === 1;
    const artistSlug = (segs[0] || '').replace(/-/g, ' ');
    const titleSlug =
      segs[1] === 'sets' && segs[2]
        ? segs[2].replace(/-/g, ' ')
        : segs[1] && segs[1] !== 'albums'
        ? segs[1].replace(/-/g, ' ')
        : artistSlug
        ? `Álbum / Obras de ${artistSlug}`
        : 'Álbum de SoundCloud';
    return {
      ok: true,
      provider: 'soundcloud',
      license: 'SOUNDCLOUD_OFFICIAL',
      isAlbum,
      sourceUrl: cleanUrl,
      embedUrl: buildSoundCloudEmbedUrl(cleanUrl, isAlbum),
      originUrl: cleanUrl,
      suggestedArtist: artistSlug || 'Artista SoundCloud',
      suggestedTitle: titleSlug
    };
  }

  // 6. Audio directo autorizado (.mp3, .ogg, .wav, .m4a, .aac o stream icecast/shoutcast)
  if (
    /^https?:\/\/.+/i.test(trimmed) &&
    (/\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(trimmed) ||
      /icecast|streamtheworld|radiostream|mediainbox|sc_rad/i.test(trimmed))
  ) {
    const isRadio = /icecast|streamtheworld|mediainbox|sc_rad/i.test(trimmed);
    return {
      ok: true,
      provider: isRadio ? 'radio' : 'direct_audio',
      license: isRadio ? 'RADIO_LIVE' : 'ARTIST_AUTHORIZED',
      isAlbum: false,
      sourceUrl: trimmed,
      originUrl: trimmed
    };
  }

  return {
    ok: false,
    error:
      'Formato no reconocido. Pegá un enlace de álbum o tema de SoundCloud, Spotify, Internet Archive, un <iframe> de Bandcamp o una URL directa .mp3/.ogg.'
  };
}

const STARTER_TRACKS: YouMusicTrack[] = [
  {
    id: 'ym-starter-radionacional',
    title: 'LRA1 Radio Nacional · Música y Cultura en Vivo',
    artist: 'Radio Nacional Argentina',
    genre: 'Radio / Cultura',
    provider: 'radio',
    license: 'RADIO_LIVE',
    sourceUrl: 'https://sa.mp3.icecast.magma.edge-access.net/sc_rad1',
    originUrl: 'https://www.radionacional.com.ar/',
    coverColor: COVER_PALETTE[0],
    notes: 'Emisión oficial en directo vía stream público verificado.',
    artistAuthorized: true,
    isFavorite: false,
    plays: 0,
    addedAt: '2026-11-20T00:00:00.000Z'
  },
  {
    id: 'ym-starter-cadena3',
    title: 'Cadena 3 · Señal Musical e Informativa',
    artist: 'Cadena 3 Argentina',
    genre: 'Radio / Folklore y Pop',
    provider: 'radio',
    license: 'RADIO_LIVE',
    sourceUrl: 'https://liveradio.mediainbox.net/radio3.mp3',
    originUrl: 'https://www.cadena3.com/',
    coverColor: COVER_PALETTE[2],
    notes: 'Stream oficial verificado en directo.',
    artistAuthorized: true,
    isFavorite: false,
    plays: 0,
    addedAt: '2026-11-20T00:00:00.000Z'
  },
  {
    id: 'ym-starter-sc-ambient',
    title: 'Sesión Acústica Independiente (Ejemplo SoundCloud Oficial)',
    artist: 'SoundCloud Creator Demo',
    genre: 'Acústico / Indie',
    provider: 'soundcloud',
    license: 'SOUNDCLOUD_OFFICIAL',
    sourceUrl: 'https://soundcloud.com/forss/flickermood',
    embedUrl: buildSoundCloudEmbedUrl('https://soundcloud.com/forss/flickermood'),
    originUrl: 'https://soundcloud.com/forss/flickermood',
    coverColor: COVER_PALETTE[1],
    notes: 'Reproducido mediante el reproductor oficial embebible de SoundCloud (US$0).',
    artistAuthorized: true,
    isFavorite: false,
    plays: 0,
    addedAt: '2026-11-20T00:00:00.000Z'
  }
];

function readState(): YouMusicState {
  if (typeof window === 'undefined') {
    return { tracks: STARTER_TRACKS, playlists: [] };
  }
  try {
    const raw = localStorage.getItem(YOU_MUSIC_STORAGE_KEY);
    if (!raw) {
      return { tracks: STARTER_TRACKS, playlists: [] };
    }
    const parsed = JSON.parse(raw);
    const tracks = Array.isArray(parsed?.tracks) && parsed.tracks.length > 0
      ? parsed.tracks
      : STARTER_TRACKS;
    const playlists = Array.isArray(parsed?.playlists) ? parsed.playlists : [];
    return { tracks, playlists };
  } catch {
    return { tracks: STARTER_TRACKS, playlists: [] };
  }
}

function writeState(state: YouMusicState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(YOU_MUSIC_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function loadYouMusicState(): YouMusicState {
  return readState();
}

export function addYouMusicTrack(
  input: Omit<YouMusicTrack, 'id' | 'coverColor' | 'isFavorite' | 'plays' | 'addedAt'>
): YouMusicState {
  const cur = readState();
  const track: YouMusicTrack = {
    ...input,
    id: `ym-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    coverColor: pickCoverColor(`${input.artist}-${input.title}`),
    isFavorite: false,
    plays: 0,
    addedAt: new Date().toISOString()
  };
  const next: YouMusicState = {
    ...cur,
    tracks: [track, ...cur.tracks]
  };
  writeState(next);
  return next;
}

export function toggleYouMusicFavorite(trackId: string): YouMusicState {
  const cur = readState();
  const next: YouMusicState = {
    ...cur,
    tracks: cur.tracks.map((t) =>
      t.id === trackId ? { ...t, isFavorite: !t.isFavorite } : t
    )
  };
  writeState(next);
  return next;
}

export function recordYouMusicPlay(trackId: string): YouMusicState {
  const cur = readState();
  const next: YouMusicState = {
    ...cur,
    tracks: cur.tracks.map((t) =>
      t.id === trackId ? { ...t, plays: (t.plays || 0) + 1 } : t
    )
  };
  writeState(next);
  return next;
}

export function removeYouMusicTrack(trackId: string): YouMusicState {
  const cur = readState();
  const next: YouMusicState = {
    ...cur,
    tracks: cur.tracks.filter((t) => t.id !== trackId)
  };
  writeState(next);
  return next;
}

export function getAtlasMusicRecommendation(
  tracks: YouMusicTrack[],
  currentTrackId?: string | null
): YouMusicTrack | null {
  const pool = tracks.filter((t) => t.id !== currentTrackId);
  if (pool.length === 0) return null;
  const current = tracks.find((t) => t.id === currentTrackId);
  const curGenre = (current?.genre || '').toLowerCase();

  // Prioriza afinidad de género o favoritos sin APIs pagas
  const scored = pool.map((t) => {
    let score = 0;
    if (curGenre && t.genre.toLowerCase().includes(curGenre.split('/')[0].trim())) {
      score += 3;
    }
    if (t.isFavorite) score += 2;
    if (t.provider === 'soundcloud' || t.provider === 'bandcamp') score += 1;
    return { track: t, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.track || pool[0];
}

export function getLicenseBadgeLabel(license: YouMusicLicense): string {
  switch (license) {
    case 'YOUTUBE_OFFICIAL_VIDEO':
      return 'YouTube Oficial · Video';
    case 'DAILYMOTION_OFFICIAL':
      return 'Dailymotion Oficial';
    case 'PEERTUBE_OPEN':
      return 'PeerTube Abierto';
    case 'OPENVERSE_CC':
      return 'Openverse CC · Sin anuncios';
    case 'WIKIMEDIA_COMMONS':
      return 'Wikimedia Commons · Libre';
    case 'SOUNDCLOUD_OFFICIAL':
      return 'SoundCloud Oficial';
    case 'BANDCAMP_OFFICIAL':
      return 'Bandcamp Oficial';
    case 'SPOTIFY_OFFICIAL':
      return 'Spotify Oficial';
    case 'ARCHIVE_ORG_OFFICIAL':
      return 'Internet Archive Oficial';
    case 'MIXCLOUD_OFFICIAL':
      return 'Mixcloud · Sin anuncios';
    case 'AUDIUS_OFFICIAL':
      return 'Audius · Sin anuncios';
    case 'JAMENDO_CC':
      return 'Jamendo CC · Sin anuncios';
    case 'AUDIOMACK_OFFICIAL':
      return 'Audiomack Oficial';
    case 'ARTIST_AUTHORIZED':
      return 'Artista Autorizado';
    case 'CREATIVE_COMMONS':
      return 'Creative Commons';
    case 'RADIO_LIVE':
    default:
      return 'Radio Oficial en Vivo';
  }
}

export function buildYouMusicShareUrl(track: YouMusicTrack): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://youapp.tv';
  const params = new URLSearchParams();
  params.set('shared', '1');
  params.set('t', track.title);
  params.set('a', track.artist);
  params.set('g', track.genre);
  params.set('p', track.provider);
  params.set('l', track.license);
  params.set('u', track.sourceUrl);
  if (track.isAlbum) params.set('alb', '1');
  if (track.embedUrl) params.set('e', track.embedUrl);
  if (track.originUrl && track.originUrl !== track.sourceUrl) {
    params.set('o', track.originUrl);
  }
  return `${origin}/youmusic?${params.toString()}`;
}

export function parseSharedYouMusicTrack(searchParams: URLSearchParams): YouMusicTrack | null {
  const sourceUrl = searchParams.get('u')?.trim();
  if (!sourceUrl) return null;
  const providerRaw = searchParams.get('p') as YouMusicProvider | null;
  const provider: YouMusicProvider =
    providerRaw &&
    [
      'youtube_official',
      'dailymotion',
      'peertube',
      'openverse',
      'wikimedia',
      'soundcloud',
      'bandcamp',
      'spotify',
      'archive',
      'mixcloud',
      'audius',
      'jamendo',
      'audiomack',
      'direct_audio',
      'radio'
    ].includes(providerRaw)
      ? providerRaw
      : 'direct_audio';
  const licenseRaw = searchParams.get('l') as YouMusicLicense | null;
  const license: YouMusicLicense =
    licenseRaw &&
    [
      'YOUTUBE_OFFICIAL_VIDEO',
      'DAILYMOTION_OFFICIAL',
      'PEERTUBE_OPEN',
      'OPENVERSE_CC',
      'WIKIMEDIA_COMMONS',
      'SOUNDCLOUD_OFFICIAL',
      'BANDCAMP_OFFICIAL',
      'SPOTIFY_OFFICIAL',
      'ARCHIVE_ORG_OFFICIAL',
      'MIXCLOUD_OFFICIAL',
      'AUDIUS_OFFICIAL',
      'JAMENDO_CC',
      'AUDIOMACK_OFFICIAL',
      'ARTIST_AUTHORIZED',
      'CREATIVE_COMMONS',
      'RADIO_LIVE'
    ].includes(licenseRaw)
      ? licenseRaw
      : 'ARTIST_AUTHORIZED';
  const isAlbum = searchParams.get('alb') === '1';
  const title = searchParams.get('t')?.trim() || 'Onda musical compartida';
  const artist = searchParams.get('a')?.trim() || 'YOU MUSIC';
  const genre = searchParams.get('g')?.trim() || 'Música';
  const embedUrl =
    searchParams.get('e')?.trim() ||
    (provider === 'soundcloud' ? buildSoundCloudEmbedUrl(sourceUrl, isAlbum) : undefined);
  const originUrl = searchParams.get('o')?.trim() || sourceUrl;

  return {
    id: `shared-${Math.abs(
      Array.from(sourceUrl).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0)
    ).toString(36)}`,
    title,
    artist,
    genre,
    provider,
    license,
    isAlbum,
    sourceUrl,
    embedUrl,
    originUrl,
    coverColor: pickCoverColor(`${artist}-${title}`),
    artistAuthorized: true,
    isFavorite: false,
    plays: 0,
    addedAt: new Date().toISOString()
  };
}

// ============================================================================
// Descubrimiento en vivo US$0: Radio Browser (+40.000 radios) y Audius (0 anuncios)
// ============================================================================

export async function searchRadioBrowserStations(
  query: string,
  countryCode = ''
): Promise<YouMusicTrack[]> {
  const q = query.trim();
  const params = new URLSearchParams({
    limit: '16',
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true'
  });
  if (q) params.set('name', q);
  if (countryCode) params.set('countrycode', countryCode);

  const hosts = [
    'https://de1.api.radio-browser.info',
    'https://nl1.api.radio-browser.info'
  ];

  for (const host of hosts) {
    try {
      const url = q
        ? `${host}/json/stations/search?${new URLSearchParams({
            limit: '18',
            hidebroken: 'true',
            order: 'clickcount',
            reverse: 'true',
            tag: q,
            ...(countryCode ? { countrycode: countryCode } : {})
          }).toString()}`
        : `${host}/json/stations/search?${params.toString()}`;

      const res = await fetch(url);
      if (!res.ok) continue;
      let rows: any[] = await res.json();

      // Si por tag vino vacío, reintentar buscando por nombre
      if ((!Array.isArray(rows) || rows.length === 0) && q) {
        const resByName = await fetch(`${host}/json/stations/search?${params.toString()}`);
        if (resByName.ok) {
          rows = await resByName.json();
        }
      }

      if (!Array.isArray(rows)) continue;

      const usable = rows
        .filter((r) => typeof r?.url_resolved === 'string' && /^https:\/\//i.test(r.url_resolved))
        .slice(0, 12);

      return usable.map((r) => {
        const name = String(r.name || 'Radio en vivo').trim();
        const country = String(r.country || 'Internacional').trim();
        const tags = String(r.tags || q || 'Música')
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean)
          .slice(0, 2)
          .join(' · ');
        return {
          id: `rb-${r.stationuuid || Math.random().toString(36).slice(2, 8)}`,
          title: name,
          artist: country,
          genre: tags || 'Radio Musical',
          provider: 'radio' as const,
          license: 'RADIO_LIVE' as const,
          sourceUrl: r.url_resolved,
          originUrl: r.homepage || r.url_resolved,
          coverColor: pickCoverColor(`${country}-${name}`),
          notes: `Stream público verificado vía Radio Browser (${r.codec || 'MP3/AAC'} ${
            r.bitrate ? `${r.bitrate} kbps` : ''
          }).`,
          artistAuthorized: true,
          isFavorite: false,
          plays: 0,
          addedAt: new Date().toISOString()
        };
      });
    } catch {
      // probar siguiente mirror público
    }
  }
  return [];
}

export async function searchAudiusTracks(query: string): Promise<YouMusicTrack[]> {
  const q = query.trim() || 'acoustic';
  const endpoint = `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(
    q
  )}&app_name=YOUAPP_MUSIC`;
  try {
    const res = await fetch(endpoint);
    if (!res.ok) return [];
    const payload = await res.json();
    const list: any[] = Array.isArray(payload?.data) ? payload.data : [];
    return list.slice(0, 12).map((item) => {
      const trackId = String(item.id || '');
      const title = String(item.title || 'Tema independiente');
      const artist = String(item.user?.name || item.user?.handle || 'Artista Audius');
      const genre = String(item.genre || 'Independiente');
      const permalink = item.permalink
        ? `https://audius.co${item.permalink}`
        : 'https://audius.co';
      return {
        id: `aud-${trackId}`,
        title,
        artist,
        genre,
        provider: 'audius' as const,
        license: 'AUDIUS_OFFICIAL' as const,
        sourceUrl: `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(
          trackId
        )}/stream?app_name=YOUAPP_MUSIC`,
        originUrl: permalink,
        coverColor: pickCoverColor(`${artist}-${title}`),
        notes: 'Streaming directo oficial de Audius · Tema completo sin publicidad (US$0).',
        artistAuthorized: true,
        isFavorite: false,
        plays: 0,
        addedAt: new Date().toISOString()
      };
    });
  } catch {
    return [];
  }
}

function readYtText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs)) {
    return node.runs.map((r: any) => String(r?.text || '')).join('');
  }
  return '';
}

function collectYouTubeVideoRenderers(obj: any, out: any[], limit: number): void {
  if (!obj || typeof obj !== 'object' || out.length >= limit) return;
  if (obj.videoRenderer && typeof obj.videoRenderer.videoId === 'string') {
    out.push(obj.videoRenderer);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (out.length >= limit) break;
      collectYouTubeVideoRenderers(item, out, limit);
    }
    return;
  }
  for (const val of Object.values(obj)) {
    if (out.length >= limit) break;
    if (val && typeof val === 'object') {
      collectYouTubeVideoRenderers(val, out, limit);
    }
  }
}

/**
 * Busca música/álbumes usando el proxy local /api/youtubei (0 cuota YouTube Data API v3)
 * y devuelve punteros para el reproductor OFICIAL VISIBLE de YouTube (sin extraer audio).
 */
export async function searchYouTubeOfficialMusic(
  query: string,
  limit = 18
): Promise<YouMusicTrack[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch('/api/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `${q} musica oficial`,
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20260101.00.00',
            hl: 'es',
            gl: 'AR'
          }
        }
      })
    });
    if (!res.ok) return [];
    const data = await res.json();
    const renderers: any[] = [];
    collectYouTubeVideoRenderers(data, renderers, limit * 2);

    const seen = new Set<string>();
    const tracks: YouMusicTrack[] = [];
    for (const vr of renderers) {
      const vid = String(vr.videoId || '');
      if (!/^[A-Za-z0-9_-]{11}$/.test(vid) || seen.has(vid)) continue;
      seen.add(vid);
      const title = readYtText(vr.title).trim();
      if (!title) continue;
      const artist =
        readYtText(vr.ownerText).trim() ||
        readYtText(vr.longBylineText).trim() ||
        'YouTube Oficial';
      const watchUrl = `https://www.youtube.com/watch?v=${vid}`;
      tracks.push({
        id: `ytm-${vid}`,
        title,
        artist,
        genre: q,
        provider: 'youtube_official',
        license: 'YOUTUBE_OFFICIAL_VIDEO',
        isAlbum: /album|disco completo|full album|concierto|live/i.test(title),
        sourceUrl: watchUrl,
        embedUrl: `https://www.youtube.com/embed/${vid}?rel=0&modestbranding=1`,
        originUrl: watchUrl,
        coverColor: pickCoverColor(`${artist}-${title}`),
        notes: 'Reproductor oficial visible de YouTube (0 cuota Data API v3 · puntero guardado en Shard).',
        artistAuthorized: true,
        isFavorite: false,
        plays: 0,
        addedAt: new Date().toISOString()
      });
      if (tracks.length >= limit) break;
    }
    return tracks;
  } catch {
    return [];
  }
}

/**
 * Search Music — Openverse Audio API (Creative Commons, sin clave, 0 anuncios)
 */
export async function searchOpenverseAudio(
  query: string,
  limit = 15
): Promise<YouMusicTrack[]> {
  const q = query.trim() || 'acoustic';
  const url = `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(
    q
  )}&category=music&page_size=${Math.min(20, Math.max(5, limit))}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const rows: any[] = Array.isArray(data?.results) ? data.results : [];
    return rows
      .filter((r) => typeof r?.url === 'string' && /^https:\/\//i.test(r.url))
      .slice(0, limit)
      .map((r) => {
        const title = String(r.title || 'Obra Openverse').trim();
        const artist = String(r.creator || 'Artista Openverse CC').trim();
        const genre = Array.isArray(r.genres) && r.genres[0] ? String(r.genres[0]) : q;
        return {
          id: `ov-${r.id || Math.random().toString(36).slice(2, 8)}`,
          title,
          artist,
          genre,
          provider: 'openverse' as const,
          license: 'OPENVERSE_CC' as const,
          sourceUrl: r.url,
          originUrl: r.foreign_landing_url || r.url,
          coverColor: pickCoverColor(`${artist}-${title}`),
          notes: `Licencia Creative Commons (${String(r.license || 'CC').toUpperCase()}) vía Openverse · Sin anuncios.`,
          artistAuthorized: true,
          isFavorite: false,
          plays: 0,
          addedAt: new Date().toISOString()
        };
      });
  } catch {
    return [];
  }
}

/**
 * Search Music — Wikimedia Commons Audio API (Dominio Público / CC, CORS abierto, 0 anuncios)
 */
export async function searchWikimediaCommonsAudio(
  query: string,
  limit = 15
): Promise<YouMusicTrack[]> {
  const q = query.trim() || 'piano';
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=${Math.min(
    20,
    Math.max(5, limit)
  )}&gsrsearch=${encodeURIComponent(
    `${q} filetype:audio`
  )}&prop=imageinfo&iiprop=url|mime&format=json&origin=*`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data?.query?.pages ? Object.values<any>(data.query.pages) : [];
    const out: YouMusicTrack[] = [];
    for (const p of pages) {
      const info = Array.isArray(p?.imageinfo) ? p.imageinfo[0] : null;
      const fileUrl = typeof info?.url === 'string' ? info.url : '';
      const mime = String(info?.mime || '').toLowerCase();
      if (!fileUrl || (!mime.startsWith('audio/') && !/\.(ogg|oga|mp3|wav|flac)(\?|$)/i.test(fileUrl))) {
        continue;
      }
      const rawTitle = String(p.title || 'Audio Wikimedia')
        .replace(/^File:/i, '')
        .replace(/\.(ogg|oga|mp3|wav|flac)$/i, '')
        .replace(/_/g, ' ')
        .trim();
      out.push({
        id: `wm-${p.pageid || Math.random().toString(36).slice(2, 8)}`,
        title: rawTitle,
        artist: 'Wikimedia Commons',
        genre: q,
        provider: 'wikimedia',
        license: 'WIKIMEDIA_COMMONS',
        sourceUrl: fileUrl,
        originUrl: info?.descriptionurl || fileUrl,
        coverColor: pickCoverColor(`wm-${rawTitle}`),
        notes: 'Grabación libre en Wikimedia Commons · Reproducción directa sin anuncios.',
        artistAuthorized: true,
        isFavorite: false,
        plays: 0,
        addedAt: new Date().toISOString()
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Dailymotion Public API (US$0, sin clave ni cuota YouTube)
 * Excelente cobertura de rock nacional, música latina e internacional (León Gieco, Queen, Soda, etc.)
 */
export async function searchDailymotionMusic(
  query: string,
  limit = 14
): Promise<YouMusicTrack[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `https://api.dailymotion.com/videos?search=${encodeURIComponent(
    q
  )}&fields=id,title,owner.screenname,duration,url&limit=${Math.min(20, Math.max(5, limit))}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const list: any[] = Array.isArray(data?.list) ? data.list : [];
    return list
      .filter((item) => typeof item?.id === 'string' && item?.title)
      .slice(0, limit)
      .map((item) => {
        const id = String(item.id);
        const title = String(item.title).trim();
        const artist = String(item['owner.screenname'] || 'Dailymotion').trim();
        const watchUrl = String(item.url || `https://www.dailymotion.com/video/${id}`);
        return {
          id: `dm-${id}`,
          title,
          artist,
          genre: q,
          provider: 'dailymotion' as const,
          license: 'DAILYMOTION_OFFICIAL' as const,
          isAlbum: Number(item.duration || 0) > 1200,
          sourceUrl: watchUrl,
          embedUrl: `https://geo.dailymotion.com/player.html?video=${encodeURIComponent(id)}&`,
          originUrl: watchUrl,
          coverColor: pickCoverColor(`dm-${artist}-${title}`),
          notes: 'Reproductor oficial de Dailymotion · Sin cuota de YouTube (US$0).',
          artistAuthorized: true,
          isFavorite: false,
          plays: 0,
          addedAt: new Date().toISOString()
        };
      });
  } catch {
    return [];
  }
}

/**
 * PeerTube SepiaSearch Open API (red federada abierta, US$0, sin clave ni cuota)
 */
export async function searchPeerTubeMusic(
  query: string,
  limit = 10
): Promise<YouMusicTrack[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `https://sepiasearch.org/api/v1/search/videos?search=${encodeURIComponent(
    q
  )}&count=${Math.min(15, Math.max(4, limit))}&sort=-match`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const list: any[] = Array.isArray(data?.data) ? data.data : [];
    return list
      .filter((item) => typeof item?.embedUrl === 'string' && item?.name)
      .slice(0, limit)
      .map((item) => {
        const title = String(item.name).trim();
        const artist = String(
          item.channel?.displayName || item.account?.displayName || 'PeerTube'
        ).trim();
        const watchUrl = String(item.url || item.embedUrl);
        return {
          id: `pt-${item.uuid || Math.random().toString(36).slice(2, 8)}`,
          title,
          artist,
          genre: q,
          provider: 'peertube' as const,
          license: 'PEERTUBE_OPEN' as const,
          isAlbum: Number(item.duration || 0) > 1200,
          sourceUrl: watchUrl,
          embedUrl: String(item.embedUrl),
          originUrl: watchUrl,
          coverColor: pickCoverColor(`pt-${artist}-${title}`),
          notes: 'Red abierta PeerTube · Sin anuncios ni cuota (US$0).',
          artistAuthorized: true,
          isFavorite: false,
          plays: 0,
          addedAt: new Date().toISOString()
        };
      });
  } catch {
    return [];
  }
}
