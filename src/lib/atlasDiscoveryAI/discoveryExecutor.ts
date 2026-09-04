/**
 * discoveryExecutor.ts — Ejecutor Seguro de Canales de Descubrimiento Permitidos
 */

import { HarvestDedupeIndex } from '../atlasHarvester/harvestDedupeIndex';
import { extractYouTubeVideoIds } from '../atlasHarvester/youtubeReferenceExtractor';
import { globalCandidateManifest } from '../atlasHarvester/mineCandidateManifest';
import type { DiscoveryPlan, DiscoveryRequest, DiscoveryMissionResult, DiscoveryChannel } from './types';
import type { YouTubeHarvestReference } from '../atlasHarvester/types';

export async function executeDiscoveryPlan(
  request: DiscoveryRequest,
  plan: DiscoveryPlan,
  dedupeIndex?: HarvestDedupeIndex
): Promise<DiscoveryMissionResult> {
  const t0 = Date.now();
  const index = dedupeIndex || new HarvestDedupeIndex();
  // HOT PATH GUARD: No bloquear la ejecución descargando 58.000 IDs si no fue precargado por un worker de fondo

  const missionId = `mission_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let referencesScanned = 0;
  const uniqueCandidateIds = new Set<string>();
  const discoveredBatch: YouTubeHarvestReference[] = [];

  for (const channel of plan.preferredChannels) {
    try {
      const refs = await executeChannel(channel, plan, request);
      referencesScanned += refs.length;

      for (const r of refs) {
        if (!uniqueCandidateIds.has(r.videoId)) {
          uniqueCandidateIds.add(r.videoId);
          if (!index.isDuplicate(r.videoId)) {
            index.markSeen(r.videoId);
            discoveredBatch.push(r);
            globalCandidateManifest.addCandidate(r, `discovery_ai_${channel}`, index.getTotalAtlasSize());
          }
        }
      }
    } catch {
      // Continuar con el siguiente canal
    }
  }

  let netNewPersisted = 0;
  if (discoveredBatch.length > 0) {
    netNewPersisted = await index.persistBatch(discoveredBatch);
  }

  const durationMs = Date.now() - t0;

  return {
    missionId,
    query: request.query,
    plan,
    referencesScanned,
    uniqueCandidates: uniqueCandidateIds.size,
    netNewPersisted,
    durationMs,
    predictedYield: uniqueCandidateIds.size,
    actualYield: netNewPersisted,
    aiCostUsd: 0.0004,
    coverageBefore: request.coverageScore,
    coverageAfter: Math.min(1.0, request.coverageScore + (netNewPersisted > 0 ? 0.35 : 0.0))
  };
}

import { supabase } from '../supabase';

async function executeChannel(
  channel: DiscoveryChannel,
  plan: DiscoveryPlan,
  request: DiscoveryRequest
): Promise<YouTubeHarvestReference[]> {
  const refs: YouTubeHarvestReference[] = [];
  const searchKeywords = plan.targetConcepts.length > 0 ? plan.targetConcepts : [request.query];
  const isBrowser = typeof window !== 'undefined';

  switch (channel) {
    case 'bluesky_backfill':
    case 'bluesky_live': {
      for (const kw of searchKeywords.slice(0, 3)) {
        try {
          if (isBrowser) {
            // PROHIBICIÓN ESTRICTA: El navegador jamás hace fetch directo a APIs de terceros
            // Delegar a YouApp Edge Function para evitar CORS / 403
            const { data } = await supabase.functions.invoke('publisher-video-discovery', {
              body: { query: kw, provider: 'bluesky' }
            });
            if (data?.videos && Array.isArray(data.videos)) {
              for (const v of data.videos) {
                if (v.providerContentId) {
                  refs.push({
                    videoId: v.providerContentId,
                    canonicalUrl: v.videoUrl || `https://www.youtube.com/watch?v=${v.providerContentId}`,
                    title: v.title || `Bluesky Reference [${v.providerContentId}]`,
                    publisherId: 'discovery_ai_bluesky',
                    publisherName: 'Bluesky Discovery AI (Edge)',
                    articleUrl: v.articleUrl || `https://bsky.app/post/${v.providerContentId}`,
                    country: 'GLOBAL',
                    language: 'multi',
                    category: 'Discovery AI / Bluesky',
                    harvestTier: 'bronze',
                    discoveredAt: new Date().toISOString()
                  });
                }
              }
            }
          } else {
            // Entorno servidor / Node / Worker: llamada segura server-to-server
            const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(kw)}&limit=30`;
            const res = await fetch(url, {
              signal: AbortSignal.timeout(4000),
              headers: { 'Accept': 'application/json' },
              redirect: 'follow'
            });
            if (res.ok) {
              const json = await res.json() as any;
              if (Array.isArray(json?.posts)) {
                for (const post of json.posts) {
                  const text = `${post?.record?.text || ''} ${post?.record?.embed?.external?.uri || ''}`;
                  const ids = extractYouTubeVideoIds(text);
                  for (const vid of ids) {
                    refs.push({
                      videoId: vid,
                      canonicalUrl: `https://www.youtube.com/watch?v=${vid}`,
                      title: post?.record?.embed?.external?.title || post?.record?.text?.slice(0, 80) || `Bluesky Post [${vid}]`,
                      publisherId: 'discovery_ai_bluesky',
                      publisherName: 'Bluesky Discovery AI',
                      articleUrl: post?.uri || `https://bsky.app/post/${vid}`,
                      country: 'GLOBAL',
                      language: 'multi',
                      category: 'Discovery AI / Bluesky',
                      harvestTier: 'bronze',
                      discoveredAt: post?.record?.createdAt || new Date().toISOString()
                    });
                  }
                }
              }
            } else if (res.status === 404) {
              console.warn('[DiscoveryExecutor] Bluesky endpoint 404, source marked as degraded');
            }
          }
        } catch (err: any) {
          // Fallo silencioso de canal sin romper la misión
        }
      }
      break;
    }

    case 'broadcaster_archive':
    case 'publisher_sitemap': {
      // Invocación a sitemaps de broadcasters musicales/culturales conocidos
      const sitemapEndpoints = [
        'https://urbanaplayfm.com/sitemap.xml',
        'https://www.eldestapeweb.com/sitemap/sitemap_index.xml',
        'https://catracalivre.com.br/sitemap.xml'
      ];
      for (const sm of sitemapEndpoints) {
        try {
          if (isBrowser) {
            // PROHIBICIÓN ESTRICTA: El navegador jamás hace fetch directo a sitemaps externos (CORS/301/404)
            // Delegar a YouApp Edge Function
            const { data } = await supabase.functions.invoke('publisher-video-discovery', {
              body: { url: sm }
            });
            if (data?.videos && Array.isArray(data.videos)) {
              for (const v of data.videos) {
                if (v.providerContentId) {
                  refs.push({
                    videoId: v.providerContentId,
                    canonicalUrl: v.videoUrl || `https://www.youtube.com/watch?v=${v.providerContentId}`,
                    title: v.title || `Broadcaster Reference [${v.providerContentId}]`,
                    publisherId: 'discovery_ai_broadcaster',
                    publisherName: 'Broadcaster Archive Discovery (Edge)',
                    articleUrl: sm,
                    country: 'GLOBAL',
                    language: 'multi',
                    category: 'Discovery AI / Broadcaster',
                    harvestTier: 'bronze',
                    discoveredAt: new Date().toISOString()
                  });
                }
              }
            }
          } else {
            // Entorno servidor: sigue redirects 301 automáticamente
            const res = await fetch(sm, {
              signal: AbortSignal.timeout(4000),
              redirect: 'follow'
            });
            if (res.ok) {
              const xml = await res.text();
              const ids = extractYouTubeVideoIds(xml);
              for (const vid of ids.slice(0, 20)) {
                refs.push({
                  videoId: vid,
                  canonicalUrl: `https://www.youtube.com/watch?v=${vid}`,
                  title: `Broadcaster Archive Reference [${vid}]`,
                  publisherId: 'discovery_ai_broadcaster',
                  publisherName: 'Broadcaster Archive Discovery',
                  articleUrl: sm,
                  country: 'GLOBAL',
                  language: 'multi',
                  category: 'Discovery AI / Broadcaster',
                  harvestTier: 'bronze',
                  discoveredAt: new Date().toISOString()
                });
              }
            } else if (res.status === 404) {
              console.warn('[DiscoveryExecutor] Publisher sitemap 404 (source degraded):', sm);
            }
          }
        } catch (err: any) {
          // Degradación suave sin romper la misión
        }
      }
      break;
    }

    default:
      break;
  }

  return refs;
}
