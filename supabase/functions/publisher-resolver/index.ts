import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Portales iniciales (Tier A/B) para sembrar la tabla ──────────────────────
// 20 portales activos en V1 — priorizados por autoridad + cobertura de video
const INITIAL_PUBLISHERS = [
  // Latinoamérica — Tier A
  { name: 'Infobae', domain: 'infobae.com', country: 'AR', language: 'es', category: 'news', tier: 'A', homepage_url: 'https://www.infobae.com', video_section_url: 'https://www.infobae.com/video', discovery_method: 'crawl', context_authority: 85, status: 'active' },
  { name: 'La Nación', domain: 'lanacion.com.ar', country: 'AR', language: 'es', category: 'news', tier: 'A', homepage_url: 'https://www.lanacion.com.ar', video_section_url: 'https://www.lanacion.com.ar/videos', discovery_method: 'crawl', context_authority: 82, status: 'active' },
  { name: 'Clarín', domain: 'clarin.com', country: 'AR', language: 'es', category: 'news', tier: 'A', homepage_url: 'https://www.clarin.com', video_section_url: 'https://www.clarin.com/video', discovery_method: 'crawl', context_authority: 80, status: 'active' },
  { name: 'El País', domain: 'elpais.com', country: 'ES', language: 'es', category: 'news', tier: 'A', homepage_url: 'https://elpais.com', video_section_url: 'https://elpais.com/videos', discovery_method: 'crawl', context_authority: 90, status: 'active' },
  { name: 'BBC Mundo', domain: 'bbc.com/mundo', country: 'GB', language: 'es', category: 'news', tier: 'A', homepage_url: 'https://www.bbc.com/mundo', video_section_url: 'https://www.bbc.com/mundo/topics/cg31y46g9wgt', discovery_method: 'crawl', context_authority: 95, status: 'active' },
  { name: 'CNN en Español', domain: 'cnnespanol.cnn.com', country: 'US', language: 'es', category: 'news', tier: 'A', homepage_url: 'https://cnnespanol.cnn.com', video_section_url: 'https://cnnespanol.cnn.com/video', discovery_method: 'crawl', context_authority: 90, status: 'active' },
  { name: 'DW Español', domain: 'dw.com/es', country: 'DE', language: 'es', category: 'news', tier: 'A', homepage_url: 'https://www.dw.com/es', video_section_url: 'https://www.dw.com/es/medios-de-comunicaci%C3%B3n/v%C3%ADdeo/s-100825', discovery_method: 'rss', context_authority: 88, status: 'active' },
  { name: 'France 24 Español', domain: 'france24.com/es', country: 'FR', language: 'es', category: 'news', tier: 'A', homepage_url: 'https://www.france24.com/es', video_section_url: 'https://www.france24.com/es/tv-en-vivo', discovery_method: 'crawl', context_authority: 87, status: 'active' },

  // Ciencia y Tecnología — Tier A
  { name: 'NASA', domain: 'nasa.gov', country: 'US', language: 'en', category: 'science', tier: 'A', homepage_url: 'https://www.nasa.gov', video_section_url: 'https://www.nasa.gov/multimedia/videogallery', sitemap_url: 'https://www.nasa.gov/sitemap.xml', discovery_method: 'sitemap', context_authority: 98, status: 'active' },
  { name: 'National Geographic', domain: 'nationalgeographic.com', country: 'US', language: 'en', category: 'science', tier: 'A', homepage_url: 'https://www.nationalgeographic.com', video_section_url: 'https://www.nationalgeographic.com/videos', discovery_method: 'crawl', context_authority: 92, status: 'active' },
  { name: 'MIT OpenCourseWare', domain: 'ocw.mit.edu', country: 'US', language: 'en', category: 'university', tier: 'A', homepage_url: 'https://ocw.mit.edu', video_section_url: 'https://ocw.mit.edu/search/?f=Lecture+Videos', discovery_method: 'sitemap', context_authority: 99, status: 'active' },
  { name: 'TED', domain: 'ted.com', country: 'US', language: 'en', category: 'culture', tier: 'A', homepage_url: 'https://www.ted.com', video_section_url: 'https://www.ted.com/talks', sitemap_url: 'https://www.ted.com/sitemap.xml', discovery_method: 'sitemap', context_authority: 96, status: 'active' },

  // Cultura y Educación — Tier B
  { name: 'Encuentro', domain: 'encuentro.gob.ar', country: 'AR', language: 'es', category: 'culture', tier: 'B', homepage_url: 'https://encuentro.gob.ar', video_section_url: 'https://encuentro.gob.ar/programas', discovery_method: 'crawl', context_authority: 78, status: 'active' },
  { name: 'CONICET Digital', domain: 'conicet.gov.ar', country: 'AR', language: 'es', category: 'science', tier: 'B', homepage_url: 'https://www.conicet.gov.ar', video_section_url: 'https://www.conicet.gov.ar/multimedia/videos', discovery_method: 'crawl', context_authority: 85, status: 'active' },
  { name: 'Página 12', domain: 'pagina12.com.ar', country: 'AR', language: 'es', category: 'news', tier: 'B', homepage_url: 'https://www.pagina12.com.ar', video_section_url: 'https://www.pagina12.com.ar/video', discovery_method: 'crawl', context_authority: 72, status: 'active' },
  { name: 'Perfil', domain: 'perfil.com', country: 'AR', language: 'es', category: 'news', tier: 'B', homepage_url: 'https://www.perfil.com', video_section_url: 'https://www.perfil.com/videos', discovery_method: 'crawl', context_authority: 70, status: 'active' },
  { name: 'El Destape', domain: 'eldestapeweb.com', country: 'AR', language: 'es', category: 'news', tier: 'B', homepage_url: 'https://www.eldestapeweb.com', video_section_url: 'https://www.eldestapeweb.com/videos', discovery_method: 'crawl', context_authority: 65, status: 'active' },
  { name: 'Telam', domain: 'telam.com.ar', country: 'AR', language: 'es', category: 'news', tier: 'B', homepage_url: 'https://www.telam.com.ar', video_section_url: 'https://www.telam.com.ar/multimedia/videos', discovery_method: 'crawl', context_authority: 75, status: 'active' },
  { name: 'Cultura Colectiva', domain: 'culturacolectiva.com', country: 'MX', language: 'es', category: 'culture', tier: 'B', homepage_url: 'https://culturacolectiva.com', video_section_url: 'https://culturacolectiva.com/videos', discovery_method: 'crawl', context_authority: 60, status: 'active' },
  { name: 'Vice en Español', domain: 'vice.com/es', country: 'US', language: 'es', category: 'culture', tier: 'B', homepage_url: 'https://www.vice.com/es', video_section_url: 'https://www.vice.com/es/topic/video', discovery_method: 'crawl', context_authority: 68, status: 'active' },
];

// ── Analizar un portal para detectar embeds de video ─────────────────────────
async function analyzePublisherForVideos(publisher: any): Promise<{
  hasVideos: boolean;
  embedProviders: string[];
  playbackPolicy: string;
}> {
  try {
    const url = publisher.video_section_url || publisher.homepage_url;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'YouApp-Bot/1.0 (+https://youapp.tv/bot)' },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return { hasVideos: false, embedProviders: [], playbackPolicy: 'unknown' };

    const html = await res.text();
    const embedProviders: string[] = [];

    if (/youtube\.com\/embed/.test(html) || /youtube-nocookie\.com/.test(html)) embedProviders.push('youtube');
    if (/player\.vimeo\.com/.test(html)) embedProviders.push('vimeo');
    if (/dailymotion\.com\/embed/.test(html)) embedProviders.push('dailymotion');
    if (/<video\s/i.test(html) || /\.mp4/.test(html)) embedProviders.push('native');

    const hasVideos = embedProviders.length > 0 || /<iframe/.test(html);
    const playbackPolicy = embedProviders.length > 0 ? 'embed_allowed' : hasVideos ? 'external_only' : 'unknown';

    return { hasVideos, embedProviders, playbackPolicy };
  } catch {
    return { hasVideos: false, embedProviders: [], playbackPolicy: 'unknown' };
  }
}

export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const body = await req.json();
      const {
        action = 'seed_initial',   // 'seed_initial' | 'analyze' | 'add'
        domain,
        publisher_data
      } = body;

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // ── Acción 1: Sembrar tabla con portales iniciales ──────────────────────
      if (action === 'seed_initial') {
        const { data: existing } = await supabase
          .from('publisher_sources')
          .select('domain');

        const existingDomains = new Set((existing || []).map((r: any) => r.domain));
        const toInsert = INITIAL_PUBLISHERS.filter(p => !existingDomains.has(p.domain));

        if (toInsert.length === 0) {
          return new Response(JSON.stringify({
            success: true,
            message: 'All initial publishers already seeded',
            total: INITIAL_PUBLISHERS.length
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const { error } = await supabase.from('publisher_sources').insert(toInsert);
        if (error) throw new Error(`Seed error: ${error.message}`);

        return new Response(JSON.stringify({
          success: true,
          seeded: toInsert.length,
          total: INITIAL_PUBLISHERS.length
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ── Acción 2: Analizar un portal específico ──────────────────────────────
      if (action === 'analyze') {
        if (!domain) {
          return new Response(JSON.stringify({ error: 'domain required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data: publisher } = await supabase
          .from('publisher_sources')
          .select('*')
          .eq('domain', domain)
          .maybeSingle();

        if (!publisher) {
          return new Response(JSON.stringify({ error: `Publisher ${domain} not found` }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const analysis = await analyzePublisherForVideos(publisher);
        await supabase.from('publisher_sources').update({
          playback_policy: analysis.playbackPolicy,
          last_crawled_at: new Date().toISOString(),
          next_crawl_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
        }).eq('domain', domain);

        return new Response(JSON.stringify({ success: true, domain, analysis }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ── Acción 3: Agregar un portal nuevo ──────────────────────────────────
      if (action === 'add') {
        if (!publisher_data?.domain) {
          return new Response(JSON.stringify({ error: 'publisher_data.domain required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { error } = await supabase.from('publisher_sources').upsert(
          { ...publisher_data, status: 'pending' },
          { onConflict: 'domain' }
        );

        if (error) throw new Error(error.message);

        return new Response(JSON.stringify({ success: true, domain: publisher_data.domain }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
