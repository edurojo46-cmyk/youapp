import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Normalizar resultado de Vimeo a NormalizedVideo ──────────────────────────
function normalizeVimeoResult(item: any) {
  const videoId = String(item.uri?.replace('/videos/', '') || item.id || '');
  const embed = item.embed?.html || '';
  const srcMatch = embed.match(/src="([^"]+)"/);
  const embedUrl = srcMatch ? srcMatch[1] : `https://player.vimeo.com/video/${videoId}`;

  const thumbnails = item.pictures?.sizes || [];
  const thumb = thumbnails.length > 0
    ? thumbnails[thumbnails.length - 1]?.link || thumbnails[0]?.link
    : null;

  const publishedAt = item.release_time || item.created_time || null;

  // Detectar idioma desde el campo description o tags
  const text = `${item.name || ''} ${item.description || ''}`.toLowerCase();
  const lang = /\b(el|la|de|en|que|los|con|para|una|del|por)\b/.test(text) ? 'es'
    : /\b(de|da|do|em|que|os|com)\b/.test(text) ? 'pt'
    : 'en';

  return {
    // NormalizedVideo fields
    id: `vimeo_${videoId}`,
    provider: 'vimeo' as const,
    providerContentId: videoId,
    title: item.name || 'Sin título',
    description: item.description || '',
    creatorName: item.user?.name,
    creatorId: item.user?.uri?.replace('/users/', ''),
    canonicalUrl: `https://vimeo.com/${videoId}`,
    embedUrl,
    thumbnailUrl: thumb,
    thumbnailCandidates: thumbnails.map((t: any) => t.link).reverse(),
    publishedAt,
    publishedAtPrecision: 'exact' as const,
    durationSeconds: item.duration || 0,
    language: lang,
    contentState: item.live?.status === 'streaming' ? 'live' as const : 'vod' as const,
    embeddable: item.privacy?.embed !== 'nowhere',
    metadataCompleteness: item.description ? 85 : 65,
    metadataReadiness: publishedAt ? 80 : 60,
    metadataProvenance: 'official_api' as const,
    sourceVerified: false,

    // Legacy fields para compatibilidad con ranking actual
    type: 'video',
    thumbnail: thumb,
    videoUrl: embedUrl,
    channelTitle: item.user?.name,
    channelId: item.user?.uri?.replace('/users/', ''),
    publishedText: publishedAt,
    isLive: item.live?.status === 'streaming',
    isVerified: false,
    viewCount: item.stats?.plays || 0,
    likeCount: item.metadata?.connections?.likes?.total || 0,
    source: {
      provider: 'vimeo',
      discoveryMethod: 'vimeo-api',
      discoveredAt: new Date().toISOString()
    }
  };
}

export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const body = await req.json();
      const {
        query,
        limit = 25,
        sort = 'relevant',     // 'relevant' | 'latest' | 'plays' | 'likes'
        filter = 'CC',         // 'CC' = Creative Commons — más permisivo para embed
        per_page = 25,
        page = 1,
        ingest = true          // Si ingestar resultados en youapp_index
      } = body;

      if (!query) {
        return new Response(JSON.stringify({ error: 'Query is required', items: [] }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const vimeoToken = Deno.env.get('VIMEO_ACCESS_TOKEN');
      if (!vimeoToken) {
        return new Response(JSON.stringify({
          ok: false,
          code: 'VIMEO_NOT_CONFIGURED',
          items: []
        }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ── Vimeo Search API (oficial) ──────────────────────────────────────────
      // Documentación: https://developer.vimeo.com/api/reference/videos#search_videos
      // Cost: 0 YouTube quota. Requiere token de acceso público (no search-only).
      const searchParams = new URLSearchParams({
        query,
        sort: sort || 'relevant',
        per_page: String(Math.min(per_page, 50)),
        page: String(page),
        fields: 'uri,name,description,link,duration,created_time,pictures,user,privacy,embed,stats,live',
      });

      const cleanToken = (vimeoToken || '').trim().replace(/^Bearer\s+/i, '');

      const vimeoRes = await fetch(
        `https://api.vimeo.com/videos?${searchParams.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Accept': 'application/vnd.vimeo.*+json;version=3.4',
            'User-Agent': 'YouApp-Search/1.0',
          },
          signal: AbortSignal.timeout(10000)
        }
      );


      if (!vimeoRes.ok) {
        const err = await vimeoRes.text();
        let code = 'VIMEO_UPSTREAM_ERROR';
        if (vimeoRes.status === 401 || vimeoRes.status === 403) code = 'AUTH_FAILED';
        if (vimeoRes.status === 429) code = 'RATE_LIMITED';
        return new Response(JSON.stringify({
          ok: false,
          code,
          error: `Vimeo API ${vimeoRes.status}: ${err}`,
          items: []
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const vimeoData = await vimeoRes.json();
      const items = (vimeoData.data || [])
        .slice(0, limit)
        .map(normalizeVimeoResult);

      // ── Ingestar en youapp_index (best-effort) ─────────────────────────────
      if (ingest && items.length > 0) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        if (supabaseUrl && supabaseServiceKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey);

          // Ingestar en background sin bloquear la respuesta
          Promise.all(
            items.map((item: any) =>
              supabase.from('youapp_index').upsert({
                provider: 'vimeo',
                provider_content_id: item.providerContentId,
                title: item.title,
                description: item.description,
                thumbnail_url: item.thumbnailUrl,
                canonical_url: item.canonicalUrl,
                embed_url: item.embedUrl,
                creator_id: item.creatorId,
                creator_name: item.creatorName,
                published_at: item.publishedAt,
                published_at_precision: 'exact',
                duration_seconds: item.durationSeconds,
                content_state: item.contentState,
                embeddable: item.embeddable,
                language: item.language,
                views: item.viewCount || 0,
                likes: item.likeCount || 0,
                source: 'vimeo',
                source_verified: false,
                metadata_completeness: item.metadataCompleteness,
                metadata_readiness: item.metadataReadiness,
                metadata_provenance: 'official_api',
              }, { onConflict: 'provider,provider_content_id' })
            )
          ).catch(e => console.warn('[vimeo-provider] Ingest error:', e));
        }
      }

      return new Response(JSON.stringify({
        items,
        meta: {
          total: vimeoData.total || items.length,
          page,
          per_page,
          provider: 'vimeo',
          quota_cost: 0  // Vimeo no gasta cuota de YouTube
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message, items: [] }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
