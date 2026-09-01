import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Sitios del Discovery Mesh — Fuentes académicas, culturales e institucionales ──
// Categorías: university | museum | conference | institution | openculture
// Estos sitios se diferencian de publisher_sources por:
//   - Contenido mayormente evergreen (crawl menos frecuente: 72h-168h)
//   - Altísimo context_authority (90-99)
//   - Énfasis en educación, ciencia y cultura
const DISCOVER_SOURCES = [
  // ── Plataformas educativas abiertas ──────────────────────────────────────
  {
    name: 'Khan Academy',
    domain: 'khanacademy.org',
    country: 'US', language: 'en', category: 'university', tier: 'A',
    homepage_url: 'https://www.khanacademy.org',
    video_section_url: 'https://www.khanacademy.org/math',
    discovery_method: 'crawl',
    context_authority: 93,
    crawl_interval_hours: 168,  // 1 vez por semana (contenido estable)
    status: 'active'
  },
  {
    name: 'edX',
    domain: 'edx.org',
    country: 'US', language: 'en', category: 'university', tier: 'A',
    homepage_url: 'https://www.edx.org',
    video_section_url: 'https://www.edx.org/search?tab=course',
    discovery_method: 'crawl',
    context_authority: 94,
    crawl_interval_hours: 168,
    status: 'active'
  },
  {
    name: 'Coursera',
    domain: 'coursera.org',
    country: 'US', language: 'en', category: 'university', tier: 'A',
    homepage_url: 'https://www.coursera.org',
    video_section_url: 'https://www.coursera.org/browse',
    discovery_method: 'crawl',
    context_authority: 93,
    crawl_interval_hours: 168,
    status: 'active'
  },
  {
    name: 'Fundación UNAM',
    domain: 'fundacion.unam.mx',
    country: 'MX', language: 'es', category: 'university', tier: 'A',
    homepage_url: 'https://fundacion.unam.mx',
    video_section_url: 'https://fundacion.unam.mx/videos',
    discovery_method: 'crawl',
    context_authority: 88,
    crawl_interval_hours: 72,
    status: 'active'
  },
  {
    name: 'UNAM Canal',
    domain: 'tv.unam.mx',
    country: 'MX', language: 'es', category: 'university', tier: 'A',
    homepage_url: 'https://tv.unam.mx',
    video_section_url: 'https://tv.unam.mx',
    discovery_method: 'crawl',
    context_authority: 88,
    crawl_interval_hours: 48,
    status: 'active'
  },
  {
    name: 'Open Culture',
    domain: 'openculture.com',
    country: 'US', language: 'en', category: 'openculture', tier: 'A',
    homepage_url: 'https://www.openculture.com',
    video_section_url: 'https://www.openculture.com/freeonlinecourses',
    discovery_method: 'crawl',
    context_authority: 87,
    crawl_interval_hours: 48,
    status: 'active'
  },

  // ── Museos e Instituciones Culturales ────────────────────────────────────
  {
    name: 'Smithsonian Institution',
    domain: 'smithsonian.si.edu',
    country: 'US', language: 'en', category: 'museum', tier: 'A',
    homepage_url: 'https://www.si.edu',
    video_section_url: 'https://www.smithsonianchannel.com/videos',
    sitemap_url: 'https://www.si.edu/sitemap.xml',
    discovery_method: 'sitemap',
    context_authority: 97,
    crawl_interval_hours: 168,
    status: 'active'
  },
  {
    name: 'MoMA',
    domain: 'moma.org',
    country: 'US', language: 'en', category: 'museum', tier: 'A',
    homepage_url: 'https://www.moma.org',
    video_section_url: 'https://www.moma.org/audio+video/',
    discovery_method: 'crawl',
    context_authority: 95,
    crawl_interval_hours: 168,
    status: 'active'
  },
  {
    name: 'Museo del Prado',
    domain: 'museodelprado.es',
    country: 'ES', language: 'es', category: 'museum', tier: 'A',
    homepage_url: 'https://www.museodelprado.es',
    video_section_url: 'https://www.museodelprado.es/actualidad/multimedia/videos',
    discovery_method: 'crawl',
    context_authority: 96,
    crawl_interval_hours: 168,
    status: 'active'
  },
  {
    name: 'Museo Nacional de Bellas Artes (AR)',
    domain: 'bellasartes.gob.ar',
    country: 'AR', language: 'es', category: 'museum', tier: 'B',
    homepage_url: 'https://www.bellasartes.gob.ar',
    video_section_url: 'https://www.bellasartes.gob.ar/recursos/videos',
    discovery_method: 'crawl',
    context_authority: 84,
    crawl_interval_hours: 168,
    status: 'active'
  },
  {
    name: 'Internet Archive',
    domain: 'archive.org',
    country: 'US', language: 'en', category: 'openculture', tier: 'A',
    homepage_url: 'https://archive.org',
    video_section_url: 'https://archive.org/details/movies',
    discovery_method: 'sitemap',
    context_authority: 90,
    crawl_interval_hours: 24,
    status: 'active'
  },

  // ── Organizaciones Internacionales ───────────────────────────────────────
  {
    name: 'ONU / UN Web TV',
    domain: 'webtv.un.org',
    country: 'UN', language: 'en', category: 'institution', tier: 'A',
    homepage_url: 'https://webtv.un.org',
    video_section_url: 'https://webtv.un.org/en',
    discovery_method: 'crawl',
    context_authority: 98,
    crawl_interval_hours: 24,
    status: 'active'
  },
  {
    name: 'OPS / PAHO',
    domain: 'paho.org',
    country: 'UN', language: 'es', category: 'institution', tier: 'A',
    homepage_url: 'https://www.paho.org/es',
    video_section_url: 'https://www.paho.org/es/multimedia',
    discovery_method: 'crawl',
    context_authority: 97,
    crawl_interval_hours: 48,
    status: 'active'
  },
  {
    name: 'CERN',
    domain: 'cern.ch',
    country: 'CH', language: 'en', category: 'institution', tier: 'A',
    homepage_url: 'https://home.cern',
    video_section_url: 'https://home.cern/news/news/videos',
    discovery_method: 'crawl',
    context_authority: 99,
    crawl_interval_hours: 72,
    status: 'active'
  },

  // ── Conferencias Científicas y Tech ──────────────────────────────────────
  {
    name: 'AAAS Science',
    domain: 'science.org',
    country: 'US', language: 'en', category: 'conference', tier: 'A',
    homepage_url: 'https://www.science.org',
    video_section_url: 'https://www.science.org/news/sciencecast',
    discovery_method: 'crawl',
    context_authority: 97,
    crawl_interval_hours: 48,
    status: 'active'
  },
  {
    name: 'Google Research',
    domain: 'research.google',
    country: 'US', language: 'en', category: 'conference', tier: 'A',
    homepage_url: 'https://research.google',
    video_section_url: 'https://research.google/blog/',
    discovery_method: 'crawl',
    context_authority: 92,
    crawl_interval_hours: 72,
    status: 'active'
  },
  {
    name: 'NeurIPS Proceedings',
    domain: 'neurips.cc',
    country: 'US', language: 'en', category: 'conference', tier: 'A',
    homepage_url: 'https://neurips.cc',
    video_section_url: 'https://neurips.cc/virtual/2024/index.html',
    discovery_method: 'crawl',
    context_authority: 96,
    crawl_interval_hours: 168,
    status: 'pending'  // Solo activo durante temporada de conferencia
  },

  // ── Medios Especializados de Alta Autoridad ───────────────────────────────
  {
    name: 'The Lancet',
    domain: 'thelancet.com',
    country: 'GB', language: 'en', category: 'institution', tier: 'A',
    homepage_url: 'https://www.thelancet.com',
    video_section_url: 'https://www.thelancet.com/videos',
    discovery_method: 'crawl',
    context_authority: 98,
    crawl_interval_hours: 72,
    status: 'active'
  },
  {
    name: 'Nature',
    domain: 'nature.com',
    country: 'GB', language: 'en', category: 'institution', tier: 'A',
    homepage_url: 'https://www.nature.com',
    video_section_url: 'https://www.nature.com/nature/articles?type=video',
    sitemap_url: 'https://www.nature.com/sitemap.xml',
    discovery_method: 'sitemap',
    context_authority: 99,
    crawl_interval_hours: 48,
    status: 'active'
  },
  {
    name: 'Scientific American',
    domain: 'scientificamerican.com',
    country: 'US', language: 'en', category: 'institution', tier: 'A',
    homepage_url: 'https://www.scientificamerican.com',
    video_section_url: 'https://www.scientificamerican.com/video/',
    discovery_method: 'crawl',
    context_authority: 93,
    crawl_interval_hours: 48,
    status: 'active'
  },
];

// ── Extractor de embeds ──────────────────────────────────────────────────────
function extractVideoEmbeds(html: string, sourceContext: { authority: number; category: string }): {
  provider: string;
  providerContentId: string;
  embedUrl: string;
  canonicalUrl: string;
  sourceVerified: boolean;
  contextAuthority: number;
}[] {
  const results: any[] = [];
  const seen = new Set<string>();

  const addEmbed = (provider: string, videoId: string, embedUrl: string, canonicalUrl: string) => {
    const key = `${provider}_${videoId}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      provider,
      providerContentId: videoId,
      embedUrl,
      canonicalUrl,
      sourceVerified: sourceContext.authority >= 85,
      contextAuthority: sourceContext.authority
    });
  };

  // YouTube
  for (const m of html.matchAll(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/g)) {
    addEmbed('youtube', m[1], `https://www.youtube.com/embed/${m[1]}`, `https://www.youtube.com/watch?v=${m[1]}`);
  }
  // YouTube nocookie
  for (const m of html.matchAll(/youtube-nocookie\.com\/embed\/([a-zA-Z0-9_-]{11})/g)) {
    addEmbed('youtube', m[1], `https://www.youtube-nocookie.com/embed/${m[1]}`, `https://www.youtube.com/watch?v=${m[1]}`);
  }
  // Vimeo
  for (const m of html.matchAll(/player\.vimeo\.com\/video\/(\d+)/g)) {
    addEmbed('vimeo', m[1], `https://player.vimeo.com/video/${m[1]}`, `https://vimeo.com/${m[1]}`);
  }
  // Dailymotion
  for (const m of html.matchAll(/dailymotion\.com\/embed\/video\/([a-zA-Z0-9]+)/g)) {
    addEmbed('dailymotion', m[1], `https://www.dailymotion.com/embed/video/${m[1]}`, `https://www.dailymotion.com/video/${m[1]}`);
  }

  return results;
}

export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const body = await req.json();
      const {
        action = 'crawl',           // 'crawl' | 'seed_initial' | 'status'
        max_sites = 5,
        category_filter,            // 'university' | 'museum' | 'conference' | 'institution' | 'openculture'
        domain_filter,
        dry_run = false
      } = body;

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // ── Sembrar tabla con sitios iniciales ──────────────────────────────────
      if (action === 'seed_initial') {
        const { data: existing } = await supabase
          .from('publisher_sources')
          .select('domain');

        const existingDomains = new Set((existing || []).map((r: any) => r.domain));
        const toInsert = DISCOVER_SOURCES.filter(s => !existingDomains.has(s.domain));

        if (toInsert.length === 0) {
          return new Response(JSON.stringify({
            success: true,
            message: 'All discover sources already seeded',
            total: DISCOVER_SOURCES.length
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const { error } = await supabase.from('publisher_sources').insert(toInsert);
        if (error) throw new Error(`Seed error: ${error.message}`);

        return new Response(JSON.stringify({
          success: true,
          seeded: toInsert.length,
          total: DISCOVER_SOURCES.length
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ── Estado de los sitios ────────────────────────────────────────────────
      if (action === 'status') {
        const categories = ['university', 'museum', 'conference', 'institution', 'openculture'];
        const stats: Record<string, any> = {};

        for (const cat of categories) {
          const { count } = await supabase
            .from('publisher_sources')
            .select('*', { count: 'exact', head: true })
            .eq('category', cat)
            .eq('status', 'active');
          stats[cat] = count || 0;
        }

        const { count: videosDiscovered } = await supabase
          .from('youapp_index')
          .select('*', { count: 'exact', head: true })
          .eq('source', 'publisher');

        return new Response(JSON.stringify({
          success: true,
          stats,
          videos_in_atlas: videosDiscovered || 0
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ── Crawl de sitios activos ─────────────────────────────────────────────
      let siteQuery = supabase
        .from('publisher_sources')
        .select('*')
        .eq('status', 'active')
        .eq('robots_allowed', true)
        .lte('next_crawl_at', new Date().toISOString())
        .in('category', ['university', 'museum', 'conference', 'institution', 'openculture'])
        .order('context_authority', { ascending: false })
        .limit(max_sites);

      if (category_filter) siteQuery = siteQuery.eq('category', category_filter);
      if (domain_filter) siteQuery = siteQuery.eq('domain', domain_filter);

      const { data: sites } = await siteQuery;

      if (!sites || sites.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          message: 'No discover sources due for crawl. Run seed_initial first.',
          crawled: 0
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const results = {
        crawled: 0,
        embeds_found: 0,
        videos_ingested: 0,
        enrichment_queued: 0,
        errors: [] as string[]
      };

      for (const site of sites) {
        try {
          const crawlUrl = site.video_section_url || site.homepage_url;
          if (!crawlUrl) continue;

          const res = await fetch(crawlUrl, {
            headers: {
              'User-Agent': 'YouApp-Bot/1.0 (+https://youapp.tv/bot) Educational/Cultural Discovery',
              'Accept-Language': site.language === 'es' ? 'es,en;q=0.8' : 'en,es;q=0.8'
            },
            signal: AbortSignal.timeout(12000)
          });

          if (!res.ok) {
            results.errors.push(`${site.domain}: HTTP ${res.status}`);
            continue;
          }

          const html = await res.text();
          const embeds = extractVideoEmbeds(html, {
            authority: site.context_authority,
            category: site.category
          });

          results.crawled++;
          results.embeds_found += embeds.length;

          if (!dry_run && embeds.length > 0) {
            // Ingestar en youapp_index con context_authority del sitio
            const upserts = embeds.map(embed => ({
              provider: embed.provider,
              provider_content_id: embed.providerContentId,
              canonical_url: embed.canonicalUrl,
              embed_url: embed.embedUrl,
              content_state: 'vod',
              source: 'discover',           // Distingue de 'publisher' (noticias)
              source_verified: embed.sourceVerified,
              metadata_provenance: 'crawl',
              metadata_completeness: 35,
              metadata_readiness: 25,
            }));

            const { error: ingestError } = await supabase
              .from('youapp_index')
              .upsert(upserts, { onConflict: 'provider,provider_content_id', ignoreDuplicates: true });

            if (ingestError) {
              results.errors.push(`${site.domain} ingest: ${ingestError.message}`);
            } else {
              results.videos_ingested += embeds.length;

              // Encolar en atlas-enricher (best-effort)
              const { data: newVideos } = await supabase
                .from('youapp_index')
                .select('id')
                .in('provider_content_id', embeds.map(e => e.providerContentId))
                .eq('source', 'discover');

              if (newVideos && newVideos.length > 0) {
                const batchIds = newVideos.map((v: any) => v.id);
                supabase.functions.invoke('atlas-enricher', {
                  body: { batch_ids: batchIds }
                }).catch(() => {});
                results.enrichment_queued += batchIds.length;
              }
            }
          }

          // Actualizar next_crawl_at del sitio
          if (!dry_run) {
            const intervalHours = site.crawl_interval_hours || 72;
            await supabase.from('publisher_sources').update({
              last_crawled_at: new Date().toISOString(),
              next_crawl_at: new Date(Date.now() + intervalHours * 3600 * 1000).toISOString()
            }).eq('id', site.id);
          }

        } catch (err: any) {
          results.errors.push(`${site.domain}: ${err.message}`);
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
