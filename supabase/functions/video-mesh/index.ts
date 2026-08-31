import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Búsqueda en Internet Archive ─────────────────────────────────────────────
// API pública: archive.org/advancedsearch.php
async function searchArchive(query: string, limit: number) {
  const params = new URLSearchParams({
    q: `(${query}) AND mediatype:movies`,
    fl: ['identifier', 'title', 'description', 'creator', 'date',
         'subject', 'language', 'runtime', 'downloads'].join(','),
    sort: 'downloads desc',
    rows: String(limit),
    page: '1',
    output: 'json'
  });

  const res = await fetch(
    `https://archive.org/advancedsearch.php?${params.toString()}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`Archive API ${res.status}`);
  const data = await res.json();
  return (data.response?.docs || []).map((item: any) => {
    const id = item.identifier;
    return {
      id: `archive_${id}`,
      provider: 'archive',
      providerContentId: id,
      title: item.title || id,
      description: item.description || '',
      creatorName: item.creator,
      canonicalUrl: `https://archive.org/details/${id}`,
      embedUrl: `https://archive.org/embed/${id}`,
      thumbnailUrl: `https://archive.org/services/img/${id}`,
      publishedAt: item.date ? new Date(item.date).toISOString() : null,
      publishedAtPrecision: 'year',
      durationSeconds: parseRuntime(item.runtime),
      language: item.language?.[0] || 'en',
      contentState: 'vod',
      embeddable: true,
      metadataCompleteness: item.description ? 70 : 50,
      metadataReadiness: 65,
      metadataProvenance: 'official_api',
      sourceVerified: true,
      viewCount: item.downloads || 0,
      contentFormat: item.runtime ? detectFormat(parseRuntime(item.runtime)) : 'longform',
      type: 'video',
      thumbnail: `https://archive.org/services/img/${id}`,
      videoUrl: `https://archive.org/embed/${id}`,
    };
  });
}

function parseRuntime(runtime: string): number {
  if (!runtime) return 0;
  const match = runtime.match(/(\d+):(\d+):(\d+)/) || runtime.match(/(\d+):(\d+)/);
  if (!match) return 0;
  if (match.length === 4) return +match[1] * 3600 + +match[2] * 60 + +match[3];
  return +match[1] * 60 + +match[2];
}

function detectFormat(seconds: number): string {
  if (seconds < 180) return 'short';
  if (seconds < 1200) return 'midform';
  return 'longform';
}

// ── Búsqueda en PeerTube via SepiaSearch ─────────────────────────────────────
// API pública de SepiaSearch: sepiasearch.org
async function searchPeerTube(query: string, limit: number) {
  const params = new URLSearchParams({
    search: query,
    count: String(limit),
    sort: '-match',
    nsfw: 'false',
  });

  const res = await fetch(
    `https://sepiasearch.org/api/v1/search/videos?${params.toString()}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`SepiaSearch API ${res.status}`);
  const data = await res.json();
  return (data.data || []).map((item: any) => {
    const instance = item.account?.host || 'peertube.tv';
    const uuid = item.uuid;
    const embedUrl = `https://${instance}/videos/embed/${uuid}`;
    const canonical = `https://${instance}/videos/watch/${uuid}`;
    return {
      id: `pt_${uuid}`,
      provider: 'peertube',
      providerContentId: uuid,
      title: item.name || '',
      description: item.description || '',
      creatorName: item.account?.displayName || item.account?.name,
      creatorId: item.account?.name,
      canonicalUrl: canonical,
      embedUrl,
      thumbnailUrl: item.thumbnailPath ? `https://${instance}${item.thumbnailPath}` : null,
      publishedAt: item.publishedAt || item.createdAt,
      publishedAtPrecision: 'exact',
      durationSeconds: item.duration || 0,
      language: item.language?.id || 'en',
      contentState: item.isLive ? 'live' : 'vod',
      embeddable: true,
      metadataCompleteness: item.description ? 75 : 55,
      metadataReadiness: 70,
      metadataProvenance: 'official_api',
      sourceVerified: false,
      viewCount: item.views || 0,
      likeCount: item.likes || 0,
      contentFormat: detectFormat(item.duration || 0),
      type: 'video',
      thumbnail: item.thumbnailPath ? `https://${instance}${item.thumbnailPath}` : null,
      videoUrl: embedUrl,
      isLive: !!item.isLive,
    };
  });
}

// ── Búsqueda en Twitch VODs via Helix API ────────────────────────────────────
// Requiere TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET
async function getTwitchToken(clientId: string, secret: string): Promise<string> {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${secret}&grant_type=client_credentials`,
    { method: 'POST', signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error(`Twitch OAuth ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function searchTwitch(query: string, limit: number, clientId: string, secret: string) {
  const token = await getTwitchToken(clientId, secret);

  // Buscar streams en vivo primero
  const params = new URLSearchParams({
    query,
    first: String(Math.min(limit, 20))
  });

  const headers = {
    'Client-Id': clientId,
    'Authorization': `Bearer ${token}`
  };

  // Streams en vivo
  const liveRes = await fetch(
    `https://api.twitch.tv/helix/search/streams?${params.toString()}`,
    { headers, signal: AbortSignal.timeout(8000) }
  ).catch(() => null);

  const liveData = liveRes?.ok ? await liveRes.json() : { data: [] };

  return (liveData.data || []).slice(0, limit).map((stream: any) => ({
    id: `twitch_live_${stream.id}`,
    provider: 'twitch',
    providerContentId: stream.id,
    title: stream.title || stream.game_name || 'Live Stream',
    description: stream.game_name || '',
    creatorName: stream.broadcaster_login,
    creatorId: stream.broadcaster_id,
    canonicalUrl: `https://www.twitch.tv/${stream.broadcaster_login}`,
    embedUrl: `https://player.twitch.tv/?channel=${stream.broadcaster_login}&parent=youapp.tv`,
    thumbnailUrl: stream.thumbnail_url?.replace('{width}', '480').replace('{height}', '270'),
    publishedAt: stream.started_at,
    publishedAtPrecision: 'exact',
    durationSeconds: 0,
    language: stream.broadcaster_language || 'en',
    contentState: 'live',
    embeddable: true,
    metadataCompleteness: 80,
    metadataReadiness: 90,
    metadataProvenance: 'official_api',
    sourceVerified: true,
    viewCount: stream.viewer_count || 0,
    contentFormat: 'live',
    type: 'video',
    thumbnail: stream.thumbnail_url?.replace('{width}', '480').replace('{height}', '270'),
    videoUrl: `https://player.twitch.tv/?channel=${stream.broadcaster_login}&parent=youapp.tv`,
    isLive: true,
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const body = await req.json();
      const {
        query,
        providers = ['archive', 'peertube'],  // por default, no twitch (requiere creds)
        limit = 20,
        ingest = true
      } = body;

      if (!query) return new Response(JSON.stringify({ error: 'query required', items: [] }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

      const results: any = {};
      const errors: any = {};

      // Buscar en paralelo en los proveedores solicitados
      await Promise.all([
        providers.includes('archive') && searchArchive(query, Math.ceil(limit / providers.length))
          .then(r => results.archive = r)
          .catch(e => errors.archive = e.message),

        providers.includes('peertube') && searchPeerTube(query, Math.ceil(limit / providers.length))
          .then(r => results.peertube = r)
          .catch(e => errors.peertube = e.message),

        providers.includes('twitch') && (() => {
          const clientId = Deno.env.get('TWITCH_CLIENT_ID') || '';
          const secret = Deno.env.get('TWITCH_CLIENT_SECRET') || '';
          if (!clientId || !secret) { errors.twitch = 'Missing credentials'; return Promise.resolve(); }
          return searchTwitch(query, Math.ceil(limit / providers.length), clientId, secret)
            .then(r => results.twitch = r)
            .catch(e => errors.twitch = e.message);
        })()
      ].filter(Boolean));

      const allItems = Object.values(results).flat();

      // Ingestar en youapp_index (best-effort)
      if (ingest && allItems.length > 0) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        if (supabaseUrl && supabaseServiceKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          Promise.all(allItems.map((item: any) =>
            supabase.from('youapp_index').upsert({
              provider: item.provider,
              provider_content_id: item.providerContentId,
              title: item.title,
              description: item.description,
              thumbnail_url: item.thumbnailUrl,
              canonical_url: item.canonicalUrl,
              embed_url: item.embedUrl,
              creator_name: item.creatorName,
              creator_id: item.creatorId,
              published_at: item.publishedAt,
              published_at_precision: item.publishedAtPrecision,
              duration_seconds: item.durationSeconds,
              content_state: item.contentState,
              content_format: item.contentFormat,
              embeddable: item.embeddable,
              language: item.language,
              views: item.viewCount || 0,
              source: item.provider,
              source_verified: item.sourceVerified || false,
              metadata_completeness: item.metadataCompleteness,
              metadata_readiness: item.metadataReadiness,
              metadata_provenance: item.metadataProvenance,
            }, { onConflict: 'provider,provider_content_id', ignoreDuplicates: true })
          )).catch(e => console.warn('[video-mesh] Ingest error:', e));
        }
      }

      return new Response(JSON.stringify({
        items: allItems,
        errors: Object.keys(errors).length ? errors : undefined,
        meta: {
          providers: Object.keys(results),
          total: allItems.length,
          quota_cost: 0
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message, items: [] }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
