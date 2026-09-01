import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Parser de embeds de video en HTML ────────────────────────────────────────
function extractVideoEmbeds(html: string, publisherDomain: string, publisherAuthority: number): {
  provider: string;
  providerContentId: string;
  embedUrl: string;
  canonicalUrl: string;
  sourceVerified: boolean;
}[] {
  const results: any[] = [];
  const seen = new Set<string>();

  // YouTube iframes
  const ytMatches = html.matchAll(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/g);
  for (const m of ytMatches) {
    const videoId = m[1];
    if (seen.has(`yt_${videoId}`)) continue;
    seen.add(`yt_${videoId}`);
    results.push({
      provider: 'youtube',
      providerContentId: videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      sourceVerified: publisherAuthority >= 80
    });
  }

  // Vimeo iframes
  const vmMatches = html.matchAll(/player\.vimeo\.com\/video\/(\d+)/g);
  for (const m of vmMatches) {
    const videoId = m[1];
    if (seen.has(`vm_${videoId}`)) continue;
    seen.add(`vm_${videoId}`);
    results.push({
      provider: 'vimeo',
      providerContentId: videoId,
      embedUrl: `https://player.vimeo.com/video/${videoId}`,
      canonicalUrl: `https://vimeo.com/${videoId}`,
      sourceVerified: publisherAuthority >= 80
    });
  }

  // Dailymotion iframes
  const dmMatches = html.matchAll(/dailymotion\.com\/embed\/video\/([a-zA-Z0-9]+)/g);
  for (const m of dmMatches) {
    const videoId = m[1];
    if (seen.has(`dm_${videoId}`)) continue;
    seen.add(`dm_${videoId}`);
    results.push({
      provider: 'dailymotion',
      providerContentId: videoId,
      embedUrl: `https://www.dailymotion.com/embed/video/${videoId}`,
      canonicalUrl: `https://www.dailymotion.com/video/${videoId}`,
      sourceVerified: false
    });
  }

  return results;
}

// ── Obtener título y descripción básicos desde meta tags ─────────────────────
function extractPageMeta(html: string): { title?: string; description?: string } {
  const titleMatch = html.match(/<meta[^>]+(?:property="og:title"|name="title")[^>]+content="([^"]+)"/i)
    || html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch = html.match(/<meta[^>]+(?:property="og:description"|name="description")[^>]+content="([^"]+)"/i);
  return {
    title: titleMatch?.[1]?.trim(),
    description: descMatch?.[1]?.trim()
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
        max_publishers = 5,     // Cuántos portales crawlear por ejecución
        domain_filter,          // Opcional: solo crawlear un dominio específico
        dry_run = false         // Si true: no guarda en DB, solo informa
      } = body;

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // 1. Obtener portales activos que necesitan crawl
      let publisherQuery = supabase
        .from('publisher_sources')
        .select('*')
        .eq('status', 'active')
        .eq('robots_allowed', true)
        .lte('next_crawl_at', new Date().toISOString())
        .order('context_authority', { ascending: false })
        .limit(max_publishers);

      if (domain_filter) {
        publisherQuery = publisherQuery.eq('domain', domain_filter);
      }

      const { data: publishers, error: pubError } = await publisherQuery;

      if (pubError) throw new Error(`Publisher query error: ${pubError.message}`);
      if (!publishers || publishers.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          message: 'No publishers due for crawl',
          crawled: 0
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const results = {
        crawled: 0,
        videos_found: 0,
        videos_ingested: 0,
        errors: [] as string[]
      };

      // 2. Crawlear cada portal
      for (const publisher of publishers) {
        try {
          const crawlUrl = publisher.video_section_url || publisher.homepage_url;
          if (!crawlUrl) continue;

          const res = await fetch(crawlUrl, {
            headers: {
              'User-Agent': 'YouApp-Bot/1.0 (+https://youapp.tv/bot)',
              'Accept-Language': publisher.language === 'es' ? 'es,en;q=0.5' : 'en,es;q=0.5'
            },
            signal: AbortSignal.timeout(12000)
          });

          if (!res.ok) {
            results.errors.push(`${publisher.domain}: HTTP ${res.status}`);
            continue;
          }

          const html = await res.text();
          const embeds = extractVideoEmbeds(html, publisher.domain, publisher.context_authority);
          const pageMeta = extractPageMeta(html);

          results.crawled++;
          results.videos_found += embeds.length;

          if (!dry_run && embeds.length > 0) {
            // Ingestar videos descubiertos en youapp_index
            const upserts = embeds.map(embed => ({
              provider: embed.provider,
              provider_content_id: embed.providerContentId,
              canonical_url: embed.canonicalUrl,
              embed_url: embed.embedUrl,
              content_state: 'vod',
              source: 'publisher',
              source_verified: embed.sourceVerified,
              metadata_provenance: 'crawl',
              metadata_completeness: 30,  // Solo tenemos el embed; atlas-enricher completará
              metadata_readiness: 20,     // Necesita enriquecimiento
            }));

            const { error: ingestError } = await supabase
              .from('youapp_index')
              .upsert(upserts, { onConflict: 'provider,provider_content_id', ignoreDuplicates: true });

            if (ingestError) {
              results.errors.push(`${publisher.domain} ingest: ${ingestError.message}`);
            } else {
              results.videos_ingested += embeds.length;

              // Encolar enriquecimiento en atlas-enricher para los nuevos videos
              // (best-effort, no bloquea)
              if (embeds.length > 0) {
                const { data: newVideos } = await supabase
                  .from('youapp_index')
                  .select('id')
                  .in('provider_content_id', embeds.map(e => e.providerContentId))
                  .in('provider', embeds.map(e => e.provider));

                if (newVideos && newVideos.length > 0) {
                  supabase.functions.invoke('atlas-enricher', {
                    body: { batch_ids: newVideos.map((v: any) => v.id) }
                  }).catch(() => {});
                }
              }
            }
          }

          // 3. Actualizar estado del publisher
          if (!dry_run) {
            const nextCrawl = new Date(Date.now() + (publisher.crawl_interval_hours || 24) * 3600 * 1000);
            await supabase.from('publisher_sources').update({
              last_crawled_at: new Date().toISOString(),
              next_crawl_at: nextCrawl.toISOString()
            }).eq('id', publisher.id);
          }

        } catch (err: any) {
          results.errors.push(`${publisher.domain}: ${err.message}`);
        }
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
