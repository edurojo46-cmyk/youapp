/**
 * videoMeshAdapter.ts — Fase 9: Archive + PeerTube + Twitch
 *
 * Un solo adapter que cubre los tres proveedores del Video Mesh extendido.
 * El Capability Router (Fase 8) ya decidió si este adapter se activa o no.
 * Aquí, internamente, se hace una segunda decisión granular:
 *   - Archive: si needsArchive es alto (contenido histórico)
 *   - PeerTube: si el score general es razonable (indie/federated)
 *   - Twitch: solo cuando needsLive > 70 (streams en vivo)
 *
 * NOTA: Ya no llamamos analyzeQuery() aquí porque el Router ya lo hizo antes
 * (Fase 8). Recibimos el intent via SearchQuery.intent (si existe) o
 * lo re-derivamos como fallback barato desde la propia query string.
 */

import type { ExternalAdapter, SearchOptions } from '../index';
import type { ContentItem, SearchQuery } from '../../types';
import { supabase } from '../../../supabase';

// Sub-provider scoring thresholds (más estrictos que el Router global)
const ARCHIVE_MIN_SCORE = 25;    // Activar Archive si score ≥ 25
const PEERTUBE_MIN_SCORE = 20;   // PeerTube es liviano — threshold bajo
const TWITCH_LIVE_SCORE  = 60;   // Twitch solo si realmente hay necesidad de live

// Derivación liviana de signals (sin reimportar intentDetector completo)
function quickSignals(query: SearchQuery): {
  archiveScore: number;
  peertubeScore: number;
  twitchScore: number;
} {
  const q = query.rawQuery.toLowerCase();
  let archiveScore = 20;
  let peertubeScore = 20;
  let twitchScore = 0;

  if (query.context?.needsDocumentary) {
    archiveScore = 95;
    peertubeScore = 40;
  }

  if (/historia|arqueolog[ií]a|imperio|1[89]\d{2}|archivo|cl[aá]sico|antiguo|retro|antigüedad/i.test(q)) {
    archiveScore = 90;
    twitchScore = 0;
  }
  if (/documental|documentary/i.test(q)) {
    archiveScore = Math.max(archiveScore, 65);
    peertubeScore = Math.max(peertubeScore, 40);
  }
  if (/live|en vivo|stream|twitch|gameplay|esports?/i.test(q)) {
    twitchScore = 85;
    archiveScore = Math.min(archiveScore, 10);
  }
  if (/open source|foss|linux|privacy|gnu|federated|mastodon/i.test(q)) {
    peertubeScore = 75; // PeerTube tiene mucho contenido FOSS
  }
  if (/educac|universidad|conf[e3]rencia|charla|academia/i.test(q)) {
    peertubeScore = Math.max(peertubeScore, 50);
    archiveScore = Math.max(archiveScore, 45);
  }
  if (/noticias|breaking|trending|viral|ahora/i.test(q)) {
    archiveScore = 5;
    twitchScore = Math.max(twitchScore, 40);
  }

  return { archiveScore, peertubeScore, twitchScore };
}

export class VideoMeshAdapter implements ExternalAdapter {
  id = 'video-mesh';
  costTier = 'free' as const;
  monetaryCost = 0;
  quotaCost = 0;
  priority = 4;  // Entre Discover(2)/Publisher(3) y Vimeo(5)

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    try {
      const signals = quickSignals(query);

      // Seleccionar qué sub-proveedores activar
      const providers: string[] = [];
      if (signals.archiveScore  >= ARCHIVE_MIN_SCORE)  providers.push('archive');
      if (signals.peertubeScore >= PEERTUBE_MIN_SCORE) providers.push('peertube');
      if (signals.twitchScore   >= TWITCH_LIVE_SCORE)  providers.push('twitch');

      if (providers.length === 0) return [];

      if (import.meta.env.DEV) {
        console.log(
          `[VideoMeshAdapter] Activating: [${providers.join(', ')}]` +
          ` archive=${signals.archiveScore} peertube=${signals.peertubeScore} twitch=${signals.twitchScore}` +
          ` — "${query.rawQuery}"`
        );
      }

      const { data, error } = await (supabase.functions as any).invoke('video-mesh', {
        body: {
          query: query.rawQuery,
          providers,
          limit: options?.limit || 20,
          ingest: true
        },
        signal: options?.signal
      });

      if (error || !data?.items?.length) return [];

      return data.items.map((item: any): ContentItem => ({
        id: item.id,
        type: 'video' as const,
        title: item.title,
        description: item.description,
        thumbnail: item.thumbnailUrl || item.thumbnail,
        videoUrl: item.embedUrl || item.videoUrl,
        channelTitle: item.creatorName,
        channelId: item.creatorId,
        publishedText: item.publishedAt,
        isLive: item.contentState === 'live' || item.isLive,
        isVerified: item.sourceVerified || false,
        provider: item.provider as any,
        durationSeconds: item.durationSeconds,
        viewCount: item.viewCount || 0,
        publishedAt: item.publishedAt,
        contentState: item.contentState as any,
        contentFormat: item.contentFormat,
        embeddable: item.embeddable,
        language: item.language,
        metadataCompleteness: item.metadataCompleteness,
        metadataReadiness: item.metadataReadiness,
        source: {
          provider: item.provider,
          discoveryMethod: 'video-mesh',
          discoveredAt: new Date().toISOString()
        },
        retrievalSource: 'video-mesh'
      }));

    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      if (import.meta.env.DEV) console.warn('[VideoMeshAdapter] Exception:', e.message);
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export const videoMeshAdapter = new VideoMeshAdapter();
