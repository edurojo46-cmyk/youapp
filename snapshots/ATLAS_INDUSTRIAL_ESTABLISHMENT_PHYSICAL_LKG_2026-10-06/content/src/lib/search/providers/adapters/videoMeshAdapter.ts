/**
 * videoMeshAdapter.ts — Multi-Provider Gold V2: Archive + PeerTube + Twitch
 *
 * - 0 YouTube Search Quota Cost
 * - Acceso directo resiliente a Internet Archive y SepiaSearch (PeerTube)
 * - Normaliza a ContentItem con embedUrls oficiales
 */

import type { ExternalAdapter, SearchOptions } from '../index';
import type { ContentItem, SearchQuery } from '../../types';
import { supabase } from '../../../supabase';

const ARCHIVE_MIN_SCORE = 25;
const PEERTUBE_MIN_SCORE = 20;
const TWITCH_LIVE_SCORE  = 60;

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

  if (/historia|arqueolog[ií]a|imperio|1[89]\d{2}|archivo|cl[aá]sico|antiguo|retro|antigüedad|discurso|guerra|presidente/i.test(q)) {
    archiveScore = 90;
    twitchScore = 0;
  }
  if (/documental|documentary/i.test(q)) {
    archiveScore = Math.max(archiveScore, 75);
    peertubeScore = Math.max(peertubeScore, 40);
  }
  if (/live|en vivo|stream|twitch|gameplay|esports?/i.test(q)) {
    twitchScore = 85;
    archiveScore = Math.min(archiveScore, 10);
  }
  if (/open source|foss|linux|privacy|gnu|federated|mastodon|tutorial/i.test(q)) {
    peertubeScore = 75;
  }
  if (/educac|universidad|conf[e3]rencia|charla|academia|filosofia|teologia/i.test(q)) {
    peertubeScore = Math.max(peertubeScore, 50);
    archiveScore = Math.max(archiveScore, 55);
  }

  return { archiveScore, peertubeScore, twitchScore };
}

function parseRuntime(runtime: string): number {
  if (!runtime) return 0;
  const match = runtime.match(/(\d+):(\d+):(\d+)/) || runtime.match(/(\d+):(\d+)/);
  if (!match) return 0;
  if (match.length === 4) return +match[1] * 3600 + +match[2] * 60 + +match[3];
  return +match[1] * 60 + +match[2];
}

export class VideoMeshAdapter implements ExternalAdapter {
  id = 'video-mesh';
  costTier = 'free' as const;
  monetaryCost = 0;
  quotaCost = 0;
  priority = 4;

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    try {
      const targetQuery = options?.intent?.subject && options.intent.subject.length >= 3
        ? options.intent.subject
        : (query.rawQuery || query.normalizedQuery || '');

      const signals = quickSignals(query);
      const providers: string[] = [];
      if (signals.archiveScore  >= ARCHIVE_MIN_SCORE)  providers.push('archive');
      if (signals.peertubeScore >= PEERTUBE_MIN_SCORE) providers.push('peertube');
      if (signals.twitchScore   >= TWITCH_LIVE_SCORE)  providers.push('twitch');

      if (providers.length === 0) return [];

      let rawItems: any[] = [];

      // 1. Intentar via Edge Function `video-mesh`
      try {
        const { data, error } = await (supabase.functions as any).invoke('video-mesh', {
          body: {
            query: targetQuery,
            providers,
            limit: options?.limit || 20,
            ingest: true
          },
          signal: options?.signal
        });

        if (!error && data?.items?.length) {
          rawItems = data.items;
        }
      } catch (edgeErr) {
        if (import.meta.env?.DEV) console.warn('[VideoMeshAdapter] Edge Function failed, using direct public APIs:', edgeErr);
      }

      // 2. Fallback directo a APIs públicas (Archive / SepiaSearch)
      if (rawItems.length === 0) {
        const perProviderLimit = Math.ceil((options?.limit || 20) / providers.length);
        const subTasks: Promise<any[]>[] = [];

        // Internet Archive Direct
        if (providers.includes('archive')) {
          subTasks.push(
            (async () => {
              try {
                const params = new URLSearchParams({
                  q: `(${targetQuery}) AND mediatype:movies`,
                  fl: 'identifier,title,description,creator,date,runtime,downloads',
                  sort: 'downloads desc',
                  rows: String(perProviderLimit),
                  page: '1',
                  output: 'json'
                });
                const res = await fetch(`https://archive.org/advancedsearch.php?${params.toString()}`, {
                  signal: options?.signal || AbortSignal.timeout(6000)
                });
                if (!res.ok) return [];
                const data = await res.json();
                return (data.response?.docs || []).map((doc: any) => ({
                  id: `archive_${doc.identifier}`,
                  provider: 'archive',
                  providerContentId: doc.identifier,
                  title: doc.title || doc.identifier,
                  description: doc.description || '',
                  creatorName: doc.creator || 'Internet Archive',
                  canonicalUrl: `https://archive.org/details/${doc.identifier}`,
                  embedUrl: `https://archive.org/embed/${doc.identifier}`,
                  thumbnailUrl: `https://archive.org/services/img/${doc.identifier}`,
                  publishedAt: doc.date ? new Date(doc.date).toISOString() : null,
                  durationSeconds: parseRuntime(doc.runtime || '0'),
                  embeddable: true,
                  retrievalSource: 'video-mesh'
                }));
              } catch {
                return [];
              }
            })()
          );
        }

        // PeerTube (SepiaSearch) Direct
        if (providers.includes('peertube')) {
          subTasks.push(
            (async () => {
              try {
                const params = new URLSearchParams({
                  search: targetQuery,
                  count: String(perProviderLimit),
                  sort: '-match',
                  nsfw: 'false'
                });
                const res = await fetch(`https://sepiasearch.org/api/v1/search/videos?${params.toString()}`, {
                  signal: options?.signal || AbortSignal.timeout(6000)
                });
                if (!res.ok) return [];
                const data = await res.json();
                return (data.data || []).map((item: any) => {
                  const instance = item.account?.host || 'peertube.tv';
                  const uuid = item.uuid;
                  return {
                    id: `pt_${uuid}`,
                    provider: 'peertube',
                    providerContentId: uuid,
                    title: item.name || '',
                    description: item.description || '',
                    creatorName: item.account?.displayName || item.account?.name || 'PeerTube Creator',
                    canonicalUrl: `https://${instance}/videos/watch/${uuid}`,
                    embedUrl: `https://${instance}/videos/embed/${uuid}`,
                    thumbnailUrl: item.thumbnailPath ? `https://${instance}${item.thumbnailPath}` : null,
                    publishedAt: item.publishedAt || item.createdAt,
                    durationSeconds: item.duration || 0,
                    embeddable: true,
                    retrievalSource: 'video-mesh'
                  };
                });
              } catch {
                return [];
              }
            })()
          );
        }

        const subResults = await Promise.allSettled(subTasks);
        rawItems = subResults.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      }

      if (rawItems.length === 0) return [];

      return rawItems.map((item: any): ContentItem => ({
        id: item.id,
        type: 'video' as const,
        title: item.title,
        description: item.description,
        thumbnail: item.thumbnailUrl || item.thumbnail,
        videoUrl: item.embedUrl || item.videoUrl,
        channelTitle: item.creatorName || item.channelTitle || 'VideoMesh',
        channelId: item.creatorId || item.channelId,
        publishedText: item.publishedAt || item.publishedText,
        isLive: item.contentState === 'live' || item.isLive || false,
        isVerified: true,
        provider: item.provider as any,
        providerContentId: item.providerContentId,
        durationSeconds: item.durationSeconds || 0,
        viewCount: item.viewCount || 0,
        publishedAt: item.publishedAt,
        contentState: item.contentState || 'vod',
        embeddable: item.embeddable !== false,
        language: item.language || 'es',
        metadataCompleteness: item.metadataCompleteness || 70,
        metadataReadiness: item.metadataReadiness || 65,
        canonicalUrl: item.canonicalUrl,
        embedUrl: item.embedUrl,
        source: {
          provider: item.provider,
          discoveryMethod: 'video-mesh',
          discoveredAt: new Date().toISOString()
        },
        retrievalSource: 'video-mesh'
      }));

    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      if (import.meta.env?.DEV) console.warn('[VideoMeshAdapter] Exception:', e.message);
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export const videoMeshAdapter = new VideoMeshAdapter();
