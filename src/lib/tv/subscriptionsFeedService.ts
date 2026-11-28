// ============================================================================
// YOUAPP — Feed Unificado "Novedades de los que sigo" (US$ 0 · 0 Cuota API)
// - Consulta `youapp_index` en Supabase por nombre/ID de los creadores seguidos.
// - Si el creador tiene canal de PeerTube vinculado, también trae sus últimos
//   videos públicos vía API pública de PeerTube (sin API key).
// - Ordena todo en un único feed cronológico unificado.
// ============================================================================

import { supabase } from '../supabase';
import type { FollowedCreatorMeta } from './youappSocialStore';

export interface FollowedFeedItem {
  id: string;
  videoId: string;
  provider: 'youtube' | 'peertube';
  title: string;
  creatorName: string;
  thumbnailUrl: string;
  sourceUrl: string;
  publishedAt: string;
}

function normalizeCreatorName(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/[,%()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPeerTubeCreatorVideos(
  peertubeUrl: string,
  creatorName: string
): Promise<FollowedFeedItem[]> {
  try {
    const u = new URL(peertubeUrl.trim());
    const origin = u.origin;
    const path = u.pathname.replace(/\/+$/, '');
    let apiPath = '';
    const chMatch = path.match(/^\/(?:c|video-channels)\/([^/]+)/i);
    const accMatch = path.match(/^\/(?:a|accounts)\/([^/]+)/i);
    if (chMatch?.[1]) {
      apiPath = `/api/v1/video-channels/${encodeURIComponent(chMatch[1])}/videos?count=4&sort=-publishedAt`;
    } else if (accMatch?.[1]) {
      apiPath = `/api/v1/accounts/${encodeURIComponent(accMatch[1])}/videos?count=4&sort=-publishedAt`;
    } else {
      return [];
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4500);
    const res = await fetch(`${origin}${apiPath}`, { signal: controller.signal });
    window.clearTimeout(timer);
    if (!res.ok) return [];
    const payload = await res.json();
    const list: any[] = Array.isArray(payload?.data) ? payload.data : [];
    return list
      .filter((v) => v?.uuid && v?.name)
      .slice(0, 4)
      .map((v) => {
        const thumbPath = v.thumbnailPath || v.previewPath || '';
        const thumbUrl = thumbPath
          ? thumbPath.startsWith('http')
            ? thumbPath
            : `${origin}${thumbPath}`
          : '';
        return {
          id: `pt-${v.uuid}`,
          videoId: `pt_${v.uuid}`,
          provider: 'peertube' as const,
          title: String(v.name),
          creatorName: String(v.channel?.displayName || creatorName),
          thumbnailUrl: thumbUrl,
          sourceUrl: v.url || `${origin}/w/${v.uuid}`,
          publishedAt: String(v.publishedAt || v.createdAt || '')
        };
      });
  } catch {
    return [];
  }
}

/**
 * Carga el feed unificado de novedades de los creadores seguidos (US$ 0).
 */
export async function fetchFollowedCreatorsFeed(
  creators: FollowedCreatorMeta[],
  maxItems = 28
): Promise<FollowedFeedItem[]> {
  if (!Array.isArray(creators) || creators.length === 0) return [];

  const cleanCreators = creators
    .map((c) => ({
      ...c,
      cleanName: normalizeCreatorName(c.name)
    }))
    .filter((c) => c.cleanName.length >= 2)
    .slice(0, 16);

  if (cleanCreators.length === 0) return [];

  const out: FollowedFeedItem[] = [];
  const seen = new Set<string>();

  // 1. Consulta en lote a `youapp_index` (YouTube · 0 cuota API)
  try {
    const orClauses = cleanCreators
      .slice(0, 10)
      .map((c) => `creator_name.ilike.%${c.cleanName}%`)
      .join(',');

    if (orClauses) {
      const { data, error } = await supabase
        .from('youapp_index')
        .select('video_id,title,creator_name,thumbnail_url,published_at,embeddable')
        .eq('provider', 'youtube')
        .or(orClauses)
        .limit(40);

      if (!error && Array.isArray(data)) {
        for (const r of data) {
          if (r?.embeddable === false) continue;
          const vid = String(r?.video_id || '').trim();
          if (!vid || seen.has(`yt:${vid}`)) continue;
          seen.add(`yt:${vid}`);
          out.push({
            id: `yt-${vid}`,
            videoId: vid,
            provider: 'youtube',
            title: String(r?.title || 'Video'),
            creatorName: String(r?.creator_name || 'Canal'),
            thumbnailUrl:
              String(r?.thumbnail_url || '') || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
            sourceUrl: `https://www.youtube.com/watch?v=${vid}`,
            publishedAt: String(r?.published_at || '')
          });
        }
      }
    }
  } catch {
    // fallback silencioso
  }

  // 2. Canales de PeerTube vinculados en la identidad multiplataforma del creador
  const ptCreators = cleanCreators.filter(
    (c) => c.linkedPlatforms?.peertube && /^https?:\/\//i.test(c.linkedPlatforms.peertube)
  );
  if (ptCreators.length > 0) {
    const ptBatches = await Promise.all(
      ptCreators
        .slice(0, 4)
        .map((c) => fetchPeerTubeCreatorVideos(c.linkedPlatforms!.peertube!, c.name))
    );
    for (const batch of ptBatches) {
      for (const item of batch) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        out.push(item);
      }
    }
  }

  // Ordenar por fecha de publicación descendente (más nuevos primero)
  out.sort((a, b) => {
    const ta = Date.parse(a.publishedAt || '') || 0;
    const tb = Date.parse(b.publishedAt || '') || 0;
    return tb - ta;
  });

  return out.slice(0, maxItems);
}
