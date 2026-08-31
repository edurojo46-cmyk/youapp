import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Normalizar resultado de Dailymotion a NormalizedVideo ────────────────────
function normalizeDailymotionResult(item: any) {
  const videoId = item.id || '';
  const embedUrl = `https://www.dailymotion.com/embed/video/${videoId}`;
  const canonicalUrl = `https://www.dailymotion.com/video/${videoId}`;

  // Detectar idioma básico
  const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
  const lang = /\b(el|la|de|en|que|los|con|para|una)\b/.test(text) ? 'es'
    : /\b(de|da|do|em|que|os|com)\b/.test(text) ? 'pt'
    : item.language || 'en';

  const publishedAt = item.created_time
    ? new Date(item.created_time * 1000).toISOString()
    : null;

  return {
    // NormalizedVideo fields
    id: `dm_${videoId}`,
    provider: 'dailymotion' as const,
    providerContentId: videoId,
    title: item.title || 'Sin título',
    description: item.description || '',
    creatorName: item.owner?.screenname || item.channel,
    creatorId: item.owner?.id,
    canonicalUrl,
    embedUrl,
    thumbnailUrl: item.thumbnail_480_url || item.thumbnail_360_url || item.thumbnail_url,
    publishedAt,
    publishedAtPrecision: publishedAt ? 'exact' as const : 'unknown' as const,
    durationSeconds: item.duration || 0,
    language: lang,
    contentState: item.onair ? 'live' as const : 'vod' as const,
    embeddable: item.allow_embed !== false,
    metadataCompleteness: item.description ? 75 : 55,
    metadataReadiness: publishedAt ? 70 : 50,
    metadataProvenance: 'official_api' as const,
    sourceVerified: false,

    // Legacy fields para compatibilidad con ranking actual
    type: 'video',
    thumbnail: item.thumbnail_480_url || item.thumbnail_360_url,
    videoUrl: embedUrl,
    channelTitle: item.owner?.screenname || item.channel,
    channelId: item.owner?.id,
    publishedText: publishedAt,
    isLive: !!item.onair,
    isVerified: false,
    viewCount: item.views_total || 0,
    likeCount: item.likes_total || 0,
    source: {
      provider: 'dailymotion',
      discoveryMethod: 'dailymotion-api',
      discoveredAt: new Date().toISOString()
    }
  };
}

// Campos que pedimos a la API de Dailymotion
const DM_FIELDS = [
  'id', 'title', 'description', 'duration', 'created_time',
  'thumbnail_480_url', 'thumbnail_360_url', 'thumbnail_url',
  'owner', 'channel', 'language', 'allow_embed', 'onair',
  'views_total', 'likes_total'
].join(',');

export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const body = await req.json();
      const {
        action = 'search_profiles',  // 'search_profiles' | 'catalog_profile'
        query,
        profile_id,                  // Para catalog_profile: ID de usuario/canal DM
        limit = 25,
        page = 1,
        ingest = true
      } = body;

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Credenciales opcionales — Dailymotion API pública no requiere auth para datos públicos
      const dmApiKey = Deno.env.get('DAILYMOTION_API_KEY') || '';

      let items: ReturnType<typeof normalizeDailymotionResult>[] = [];

      // ── Acción 1: Buscar en perfiles conocidos (V1 principal) ────────────────
      if (action === 'search_profiles') {
        if (!query) {
          return new Response(JSON.stringify({ error: 'Query required for search_profiles', items: [] }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Obtener perfiles Dailymotion conocidos de seed_sources
        const { data: profiles } = await supabase
          .from('seed_sources')
          .select('provider_source_id, provider_channel_id, name, status')
          .eq('provider', 'dailymotion')
          .eq('status', 'verified')
          .limit(20);

        const knownProfileIds = (profiles || [])
          .map((p: any) => p.provider_source_id || p.provider_channel_id)
          .filter(Boolean);

        if (knownProfileIds.length === 0) {
          // Sin perfiles conocidos → devolver vacío (V1: no global search)
          return new Response(JSON.stringify({
            items: [],
            meta: { total: 0, provider: 'dailymotion', note: 'No known profiles. Add Dailymotion profiles to seed_sources.' }
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Buscar en cada perfil en paralelo (máximo 5 perfiles simultáneos)
        const profileResults = await Promise.all(
          knownProfileIds.slice(0, 5).map(async (profileId: string) => {
            try {
              const params = new URLSearchParams({
                search: query,
                fields: DM_FIELDS,
                limit: String(Math.min(10, Math.ceil(limit / knownProfileIds.length))),
                page: String(page),
                sort: 'relevance',
              });

              if (dmApiKey) params.set('client_id', dmApiKey);

              const dmRes = await fetch(
                `https://api.dailymotion.com/user/${profileId}/videos?${params.toString()}`,
                { signal: AbortSignal.timeout(8000) }
              );

              if (!dmRes.ok) return [];
              const data = await dmRes.json();
              return (data.list || []).map(normalizeDailymotionResult);
            } catch {
              return [];
            }
          })
        );

        items = profileResults.flat().slice(0, limit);
      }

      // ── Acción 2: Obtener catálogo completo de un perfil específico ──────────
      // Útil para el Watcher de Dailymotion (importación periódica)
      if (action === 'catalog_profile') {
        if (!profile_id) {
          return new Response(JSON.stringify({ error: 'profile_id required for catalog_profile', items: [] }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const params = new URLSearchParams({
          fields: DM_FIELDS,
          limit: String(Math.min(limit, 100)),  // Dailymotion API v2: máx 100 por página
          page: String(page),
          sort: 'recent',
        });

        if (dmApiKey) params.set('client_id', dmApiKey);

        const dmRes = await fetch(
          `https://api.dailymotion.com/user/${profile_id}/videos?${params.toString()}`,
          { signal: AbortSignal.timeout(10000) }
        );

        if (!dmRes.ok) {
          const err = await dmRes.text();
          return new Response(JSON.stringify({ error: `Dailymotion API ${dmRes.status}: ${err}`, items: [] }), {
            status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const dmData = await dmRes.json();
        items = (dmData.list || []).map(normalizeDailymotionResult);

        // Actualizar seed_source si existe
        await supabase
          .from('seed_sources')
          .update({
            last_checked_at: new Date().toISOString(),
            next_check_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
          })
          .or(`provider_source_id.eq.${profile_id},provider_channel_id.eq.${profile_id}`)
          .eq('provider', 'dailymotion');
      }

      // ── Ingestar en youapp_index (best-effort) ─────────────────────────────
      if (ingest && items.length > 0) {
        Promise.all(
          items.map((item: any) =>
            supabase.from('youapp_index').upsert({
              provider: 'dailymotion',
              provider_content_id: item.providerContentId,
              title: item.title,
              description: item.description,
              thumbnail_url: item.thumbnailUrl,
              canonical_url: item.canonicalUrl,
              embed_url: item.embedUrl,
              creator_id: item.creatorId,
              creator_name: item.creatorName,
              published_at: item.publishedAt,
              published_at_precision: item.publishedAtPrecision,
              duration_seconds: item.durationSeconds,
              content_state: item.contentState,
              embeddable: item.embeddable,
              language: item.language,
              views: item.viewCount || 0,
              likes: item.likeCount || 0,
              source: 'dailymotion',
              source_verified: false,
              metadata_completeness: item.metadataCompleteness,
              metadata_readiness: item.metadataReadiness,
              metadata_provenance: 'official_api',
            }, { onConflict: 'provider,provider_content_id' })
          )
        ).catch(e => console.warn('[dailymotion-provider] Ingest error:', e));
      }

      return new Response(JSON.stringify({
        items,
        meta: {
          total: items.length,
          page,
          limit,
          provider: 'dailymotion',
          action,
          quota_cost: 0  // No gasta cuota de YouTube
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
