/**
 * socialReferenceHarvester.ts — Cosechador de Referencias Sociales con Community Intelligence (Social V3)
 */

import { RedditOAuthClient } from './redditOAuthClient';
import { extractYouTubeVideoId } from './youtubeReferenceExtractor';
import type { YouTubeHarvestReference } from './types';
import type { HarvestDedupeIndex } from './harvestDedupeIndex';

export type CommunityTier = 'elite' | 'strong' | 'usable' | 'saturated';

export interface SubredditTarget {
  name: string;
  category: string;
  country: string;
  language: string;
  maxPages: number;
}

export interface CommunityIntelligenceResult {
  subreddit: string;
  category: string;
  postsScanned: number;
  youtubeRefsFound: number;
  uniqueYouTubeIds: number;
  alreadyKnownAtlas: number;
  netNewCount: number;
  noveltyRate: number;
  tier: CommunityTier;
}

export const SUBREDDIT_TARGETS: SubredditTarget[] = [
  // 1. Música Especializada, Deep Cuts & Bootlegs Permitidos
  { name: 'listentothis', category: 'Música / Deep Cuts', country: 'Global', language: 'en', maxPages: 5 },
  { name: 'FullConcerts', category: 'Música / Conciertos', country: 'Global', language: 'en', maxPages: 5 },
  { name: 'LiveMusic', category: 'Música / En Vivo', country: 'Global', language: 'en', maxPages: 4 },
  { name: 'musicanueva', category: 'Música en Español', country: 'LatAm/ES', language: 'es', maxPages: 4 },
  { name: 'classicalmusic', category: 'Música Clásica', country: 'Global', language: 'multi', maxPages: 4 },
  { name: 'jazz', category: 'Música / Jazz', country: 'Global', language: 'en', maxPages: 4 },
  { name: 'hiphopheads', category: 'Música / Hip-Hop', country: 'Global', language: 'en', maxPages: 4 },
  { name: 'indieheads', category: 'Música / Indie', country: 'Global', language: 'en', maxPages: 4 },
  { name: 'electronicmusic', category: 'Música / Electrónica', country: 'Global', language: 'en', maxPages: 4 },
  { name: 'Metal', category: 'Música / Metal', country: 'Global', language: 'en', maxPages: 4 },
  { name: 'progmetal', category: 'Música / Prog Metal', country: 'Global', language: 'en', maxPages: 3 },
  { name: 'ambientmusic', category: 'Música / Ambient', country: 'Global', language: 'en', maxPages: 3 },

  // 2. Documentales, Cine, Archivos & Rarezas
  { name: 'Documentaries', category: 'Documentales', country: 'Global', language: 'en', maxPages: 5 },
  { name: 'ObscureMedia', category: 'Archivo / Rarezas Audiovisuales', country: 'Global', language: 'en', maxPages: 5 },
  { name: 'MealtimeVideos', category: 'Videos / Reportajes', country: 'Global', language: 'en', maxPages: 4 },
  { name: 'Filmmakers', category: 'Cine / Cortometrajes', country: 'Global', language: 'en', maxPages: 3 },
  { name: 'Shortfilms', category: 'Cine / Cortos', country: 'Global', language: 'multi', maxPages: 3 },

  // 3. Cultura, Historia & Archivo Iberoamericano
  { name: 'argentina', category: 'Cultura / Archivo AR', country: 'AR', language: 'es', maxPages: 4 },
  { name: 'History', category: 'Historia / Archivo', country: 'Global', language: 'en', maxPages: 3 },
  { name: 'AskHistorians', category: 'Historia / Documentación', country: 'Global', language: 'en', maxPages: 3 },

  // 4. Ciencia, Charlas & Universidades
  { name: 'TEDTalks', category: 'Conferencias / Ideas', country: 'Global', language: 'en', maxPages: 4 },
  { name: 'science', category: 'Ciencia / Divulgación', country: 'Global', language: 'en', maxPages: 3 },
  { name: 'space', category: 'Astronomía / Espacio', country: 'Global', language: 'en', maxPages: 3 },

  // 5. Deportes & Archivo Deportivo
  { name: 'soccer', category: 'Deportes / Fútbol', country: 'Global', language: 'multi', maxPages: 4 },
  { name: 'formula1', category: 'Deportes / Automovilismo', country: 'Global', language: 'en', maxPages: 3 }
];

export interface SocialCanaryProgress {
  postsScanned: number;
  postsWithYouTube: number;
  youtubeRefsFound: number;
  uniqueYouTubeIds: number;
  alreadyKnown: number;
  netNew: number;
  apiCalls: number;
  status429Count: number;
  errorsCount: number;
  communityIntelligence: CommunityIntelligenceResult[];
  references: YouTubeHarvestReference[];
}

export async function runSocialReferenceHarvest(
  dedupeIndex: HarvestDedupeIndex,
  onProgress?: (p: SocialCanaryProgress) => void
): Promise<SocialCanaryProgress> {
  const client = new RedditOAuthClient();
  const seenVideoIdsInCanary = new Set<string>();

  const progress: SocialCanaryProgress = {
    postsScanned: 0,
    postsWithYouTube: 0,
    youtubeRefsFound: 0,
    uniqueYouTubeIds: 0,
    alreadyKnown: 0,
    netNew: 0,
    apiCalls: 0,
    status429Count: 0,
    errorsCount: 0,
    communityIntelligence: [],
    references: []
  };

  const now = new Date().toISOString();

  for (const target of SUBREDDIT_TARGETS) {
    let after: string | null = null;
    let commPostsScanned = 0;
    let commYtFound = 0;
    let commUniqueYt = 0;
    let commKnown = 0;
    let commNetNew = 0;

    for (let page = 1; page <= target.maxPages; page++) {
      try {
        progress.apiCalls++;
        const response = await client.fetchSubredditListing(
          target.name,
          'top',
          'all',
          after,
          100
        );

        if (response.rateLimitRemaining < 5) {
          await new Promise(r => setTimeout(r, Math.min(5000, (response.rateLimitResetSec || 5) * 1000)));
        }

        if (response.posts.length === 0) break;

        for (const post of response.posts) {
          progress.postsScanned++;
          commPostsScanned++;

          const candidateTexts = [
            post.url,
            post.selftext,
            post.mediaHtml
          ].filter(Boolean);

          let foundInPost = false;

          for (const text of candidateTexts) {
            const videoId = extractYouTubeVideoId(String(text));
            if (videoId && videoId.length === 11) {
              if (!foundInPost) {
                progress.postsWithYouTube++;
                foundInPost = true;
              }

              progress.youtubeRefsFound++;
              commYtFound++;

              if (!seenVideoIdsInCanary.has(videoId)) {
                seenVideoIdsInCanary.add(videoId);
                progress.uniqueYouTubeIds++;
                commUniqueYt++;

                if (dedupeIndex.isDuplicate(videoId)) {
                  progress.alreadyKnown++;
                  commKnown++;
                } else {
                  progress.netNew++;
                  commNetNew++;
                  dedupeIndex.markSeen(videoId);

                  progress.references.push({
                    videoId,
                    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
                    title: post.title ? post.title.slice(0, 160) : `Reddit Post [${videoId}]`,
                    publisherId: `reddit_${target.name}`,
                    publisherName: `r/${target.name}`,
                    articleUrl: `https://reddit.com${post.permalink}`,
                    country: target.country,
                    language: target.language,
                    category: target.category,
                    harvestTier: 'bronze',
                    discoveredAt: now
                  });
                }
              }
              break;
            }
          }
        }

        if (onProgress) onProgress(progress);

        after = response.after;
        if (!after) break;

        await new Promise(r => setTimeout(r, 400));
      } catch (err: any) {
        progress.errorsCount++;
        if (err?.message?.includes('429')) progress.status429Count++;
        break;
      }
    }

    const commNovelty = commUniqueYt > 0 ? +((commNetNew / commUniqueYt) * 100).toFixed(1) : 0;
    let tier: CommunityTier = 'saturated';
    if (commNovelty >= 60 && commNetNew >= 10) tier = 'elite';
    else if (commNovelty >= 30 && commNetNew >= 5) tier = 'strong';
    else if (commNovelty >= 10 || commNetNew > 0) tier = 'usable';

    progress.communityIntelligence.push({
      subreddit: target.name,
      category: target.category,
      postsScanned: commPostsScanned,
      youtubeRefsFound: commYtFound,
      uniqueYouTubeIds: commUniqueYt,
      alreadyKnownAtlas: commKnown,
      netNewCount: commNetNew,
      noveltyRate: commNovelty,
      tier
    });
  }

  return progress;
}
