import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️  PUERTA ÚNICA A search.list
//
// REGLA: ningún servicio, Edge Function o componente puede llamar a
// YouTube search.list directamente.
//
// El único camino válido es:
//   Todo → external-search → quotaBrain.canUseYouTube() → YouTube
//
// Si canUseYouTube() devuelve false → se deniega. Sin excepciones.
// ═══════════════════════════════════════════════════════════════════════════

// ── Configuración de presupuesto atómico ─────────────────────────────────────
const QUOTA_LIMITS = {
  organic: 70,
  qa: 10,
  emergency: 20,
  benchmark: 0
};

interface QuotaCheckParams {
  query: string;
  caller: string;
  reason: string;
  trafficClass?: string; // 'organic', 'qa', 'emergency', 'benchmark'
  allowLiveYouTube?: boolean; // explicit bypass for benchmark
}

interface QuotaDecision {
  authorized: boolean;
  opportunityScore: number;
  budgetRemaining: number;
  denialReason?: string;
  requestId: string;
}

async function canUseYouTube(
  supabase: ReturnType<typeof createClient>,
  params: QuotaCheckParams
): Promise<QuotaDecision> {
  const requestId = crypto.randomUUID();

  try {
    let bucket = params.trafficClass || 'organic';
    if (!QUOTA_LIMITS.hasOwnProperty(bucket)) {
      bucket = 'organic';
    }
    
    // Benchmark traffic with no live bypass is automatically denied
    if (bucket === 'benchmark' && params.allowLiveYouTube !== true) {
      return { authorized: false, opportunityScore: 0, budgetRemaining: 0, denialReason: 'benchmark_live_budget_0', requestId };
    }

    const defaultLimit = QUOTA_LIMITS[bucket as keyof typeof QUOTA_LIMITS];
    
    // Try to reserve atomically
    const { data: reserved, error } = await supabase.rpc('reserve_youtube_search', {
      p_bucket: bucket,
      p_default_limit: defaultLimit
    });

    if (error) {
      console.error('[QuotaBrain] RPC error:', error);
      return { authorized: false, opportunityScore: 0, budgetRemaining: 0, denialReason: `rpc_error: ${error.message}`, requestId };
    }

    const authorized = reserved === true;
    const denialReason = authorized ? undefined : `bucket_${bucket}_exhausted`;

    await logEvent(supabase, {
      requestId, ...params,
      authorized,
      denialReason,
      opportunityScore: 100, // deprecated formula
      budgetRemaining: 0 // handled by DB now
    });

    return { authorized, opportunityScore: 100, budgetRemaining: 0, denialReason, requestId };

  } catch (err: any) {
    console.error('[QuotaBrain] Error — denying by fail-safe:', err.message);
    return {
      authorized: false,
      opportunityScore: 0,
      budgetRemaining: 0,
      denialReason: `quota_brain_error: ${err.message}`,
      requestId
    };
  }
}

async function logEvent(supabase: ReturnType<typeof createClient>, params: {
  requestId: string;
  query: string;
  caller: string;
  reason: string;
  authorized: boolean;
  denialReason?: string;
  opportunityScore: number;
  budgetRemaining: number;
  atlasCoverage?: number;
  resultsReceived?: number;
  latencyMs?: number;
}) {
  try {
    await supabase.from('quota_events').insert({
      request_id:        params.requestId,
      query:             params.query,
      caller:            params.caller,
      reason:            params.reason,
      authorized:        params.authorized,
      authorized_by:     params.authorized ? 'quota_brain_server' : null,
      denial_reason:     params.denialReason,
      atlas_coverage:    params.atlasCoverage,
      opportunity_score: params.opportunityScore,
      budget_remaining:  params.budgetRemaining,
      results_received:  params.resultsReceived,
      latency_ms:        params.latencyMs,
    });
  } catch (e) {
    // Logging es best-effort: nunca bloquear la respuesta
    console.warn('[QuotaBrain] Could not log event:', e);
  }
}

// ── Normalizar resultado de YouTube a NormalizedVideo ───────────────────────
function normalizeYouTubeResult(item: any) {
  const videoId = item.id?.videoId || item.id;
  return {
    id: `yt_${videoId}`,
    provider: 'youtube' as const,
    providerContentId: videoId,
    title: item.snippet?.title || '',
    description: item.snippet?.description || '',
    creatorName: item.snippet?.channelTitle,
    creatorId: item.snippet?.channelId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url,
    thumbnailCandidates: [
      item.snippet?.thumbnails?.maxres?.url,
      item.snippet?.thumbnails?.high?.url,
      item.snippet?.thumbnails?.medium?.url,
      item.snippet?.thumbnails?.default?.url
    ].filter(Boolean),
    publishedAt: item.snippet?.publishedAt,
    publishedAtPrecision: 'exact' as const,
    contentState: item.snippet?.liveBroadcastContent === 'live' ? 'live' as const : 'vod' as const,
    embeddable: true,
    metadataCompleteness: 70,  // search.list no da duration/views; atlas-enricher completará
    metadataReadiness: 60,
    metadataProvenance: 'official_api' as const,
    sourceVerified: false,     // el canal no es una seed verificada
    // Legacy fields para compatibilidad con el ranking actual
    type: 'video',
    thumbnail: item.snippet?.thumbnails?.high?.url,
    videoUrl: `https://www.youtube.com/embed/${videoId}`,
    channelTitle: item.snippet?.channelTitle,
    channelId: item.snippet?.channelId,
    publishedText: item.snippet?.publishedAt,
    isLive: item.snippet?.liveBroadcastContent === 'live',
    isVerified: false,
    source: {
      provider: 'youtube',
      discoveryMethod: 'radar',
      discoveredAt: new Date().toISOString()
    }
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const body = await req.json();
      const {
        provider = 'youtube',
        query,
        limit = 20,
        caller = 'SearchEngine',
        reason = 'user_search',
        atlasCoverage,
        freshnessNeed,
        demand,
        reuseProbability,
        trafficClass,
        allowLiveYouTube
      } = body;

      if (!query) {
        return new Response(JSON.stringify({ error: 'Query is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // ──────────────────────────────────────────────────────────────────────
      // YouTube Radar — La única puerta a search.list
      // QuotaBrain decide aquí, en el servidor, de forma atómica.
      // ──────────────────────────────────────────────────────────────────────
      if (provider === 'youtube') {
        const apiKey = Deno.env.get('YOUTUBE_API_KEY');
        if (!apiKey) {
          return new Response(JSON.stringify({ error: 'YOUTUBE_API_KEY not configured', items: [] }), {
            status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // QuotaBrain — autorización server-side (fail-safe: sin auth = sin búsqueda)
        const startTime = Date.now();
        const decision = await canUseYouTube(supabase, {
          query, caller, reason,
          trafficClass, allowLiveYouTube
        });

        if (!decision.authorized) {
          // Respuesta con metadata de denegación (útil para el cliente y debugging)
          return new Response(JSON.stringify({
            items: [],
            quota: {
              authorized: false,
              reason: decision.denialReason,
              opportunityScore: decision.opportunityScore,
              budgetRemaining: decision.budgetRemaining,
            }
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const searchUrl = [
          'https://www.googleapis.com/youtube/v3/search',
          `?part=snippet`,
          `&q=${encodeURIComponent(query)}`,
          `&maxResults=${Math.min(limit, 50)}`,
          `&type=video`,
          `&videoEmbeddable=true`,
          `&relevanceLanguage=es`,
          `&key=${apiKey}`
        ].join('');

        const res = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });

        if (!res.ok) {
          const errBody = await res.text();
          // Log el error en quota_events para auditoría
          await logEvent(supabase, {
            requestId: decision.requestId,
            query, caller, reason,
            authorized: true,
            denialReason: `youtube_api_error: ${res.status}`,
            opportunityScore: decision.opportunityScore,
            budgetRemaining: decision.budgetRemaining,
            latencyMs: Date.now() - startTime,
          });
          throw new Error(`YouTube API ${res.status}: ${errBody}`);
        }

        const data = await res.json();
        const latencyMs = Date.now() - startTime;
        const items = (data.items || []).map(normalizeYouTubeResult);

        // Actualizar evento con resultados reales
        await supabase
          .from('quota_events')
          .update({ results_received: items.length, latency_ms: latencyMs })
          .eq('request_id', decision.requestId);

        // Ingestar candidatos de Radar en youapp_index para enriquecimiento futuro
        // (best-effort, no bloquea la respuesta)
        if (items.length > 0) {
          Promise.all(
            items.map((item: any) =>
              supabase.from('youapp_index').upsert({
                provider: 'youtube',
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
                content_state: item.contentState,
                source: 'radar',
                source_verified: false,
                metadata_provenance: 'official_api',
                metadata_completeness: 70,
                metadata_readiness: 60,
              }, { onConflict: 'provider,provider_content_id' })
            )
          ).catch(e => console.warn('[external-search] Could not ingest Radar results:', e));
        }

        return new Response(JSON.stringify({
          items,
          quota: {
            authorized: true,
            requestId: decision.requestId,
            opportunityScore: decision.opportunityScore,
            budgetRemaining: decision.budgetRemaining - 1,
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ── Otros proveedores (Vimeo, Dailymotion — Fases 6-7) ──────────────
      return new Response(JSON.stringify({
        error: `Provider "${provider}" not implemented yet`,
        items: []
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message, items: [] }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
