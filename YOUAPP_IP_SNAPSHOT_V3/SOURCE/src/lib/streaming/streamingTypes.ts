export type UniversalContentType =
  | 'video'
  | 'movie'
  | 'series'
  | 'season'
  | 'episode'
  | 'live'
  | 'signal';

export type StreamingAccessType =
  | 'subscription'
  | 'free'
  | 'rent'
  | 'buy';

export interface StreamingAvailability {
  provider: string; // 'netflix' | 'prime_video' | 'disney_plus' | 'max' | 'apple_tv_plus' | 'paramount_plus' | etc.
  providerName: string;
  providerLogo?: string;
  country: string; // 'AR'

  access: StreamingAccessType;
  accessLabel?: string; // 'Incluida con tu suscripción', 'Alquiler', 'Compra'

  webUrl?: string;
  deepLink?: string;

  price?: number;
  currency?: string;

  quality?: '4K' | 'HD' | 'SD';
  source?: string; // 'tmdb_justwatch' | 'watchmode' | 'demo_fixture'
  sourceRecordId?: string;
  verifiedAt: string; // ISO date
  isDemo?: boolean;
}

export interface UniversalContent {
  id: string;
  type: UniversalContentType;

  title: string;
  originalTitle?: string;
  description?: string;

  year?: number;
  durationMin?: number;
  durationText?: string; // '2h 49m'
  episodesCount?: number;
  seasonsCount?: number;
  currentSeasonEpisode?: string; // 'T1 E5'

  posterUrl: string;
  backdropUrl?: string;

  genres: string[];
  topics?: string[];

  director?: string;
  cast?: string[];
  rating?: number; // 0-10
  matchScore?: number; // 97 (percentage)

  externalIds?: {
    tmdb?: number;
    imdb?: string;
    watchmode?: number;
  };

  availability: StreamingAvailability[];
  primaryProvider: string; // 'netflix' | 'prime_video' | 'disney_plus' | 'max' | 'apple_tv_plus' | 'paramount_plus'

  playbackMode:
    | 'youapp_player'
    | 'external_provider'
    | 'none';

  // Watch progress for "Continuar viendo"
  progressPercent?: number; // ONLY for measured YouApp content
  progressSec?: number;
  totalDurationSec?: number;
  remainingText?: string; // '2h 20m restantes'
  lastOpenedAt?: string;
}

export interface StreamingProviderInfo {
  code: string;
  name: string;
  logo: string;
  color: string;
  badgeBg: string;
  playback: 'external_provider' | 'youapp_player';
  defaultWebUrl: string;
  isPopularInAR?: boolean;
}

export interface StreamingCapabilities {
  externalPlayback: boolean;
  availability: boolean;
  save: boolean;
  share: boolean;
  addToSignal: boolean;
  summary: boolean;
  you4: boolean;
  ask: boolean;
}

export function getStreamingCapabilities(content: UniversalContent): StreamingCapabilities {
  if (content.playbackMode === 'youapp_player' || content.type === 'video' || content.type === 'signal') {
    return {
      externalPlayback: false,
      availability: false,
      save: true,
      share: true,
      addToSignal: true,
      summary: true,
      you4: true,
      ask: true
    };
  }

  // External Streaming Provider (Netflix, Prime, Disney, Max, etc.)
  return {
    externalPlayback: true,
    availability: true,
    save: true,
    share: true,
    addToSignal: true,
    summary: true,
    you4: false,
    ask: false
  };
}

export interface UniversalLibraryItem {
  id?: string;
  userId?: string;
  contentType: UniversalContentType;
  contentKey: string;
  provider: string;
  externalId?: string;
  title: string;
  posterUrl?: string;
  metadataSnapshot: Record<string, any>;
  savedAt: string;
}
