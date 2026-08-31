import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResolveInput {
  name: string;
  handle?: string;
  provider_channel_id?: string;
  category?: string;
  tier?: string;
}

interface ResolvedChannel {
  name: string;
  handle?: string;
  channelId?: string;
  canonicalUrl?: string;
  uploadsPlaylistId?: string;
  thumbnail?: string;
  country?: string;
  officialName?: string;
  status: 'verified' | 'ambiguous' | 'not_found';
  resolutionMethod?: string;
  error?: string;
}

// ── Official YouTube API Fetcher ─────────────────────────────────────────────
async function fetchChannelFromApi(query: string, byType: 'id' | 'forHandle' | 'forUsername'): Promise<ResolvedChannel | null> {
  const apiKey = Deno.env.get('YOUTUBE_API_KEY');
  if (!apiKey) throw new Error('YOUTUBE_API_KEY missing');

  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&${byType}=${encodeURIComponent(query)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  
  if (data.items && data.items.length > 0) {
    const channel = data.items[0];
    return {
      channelId: channel.id,
      name: channel.snippet.title,
      handle: channel.snippet.customUrl,
      canonicalUrl: `https://www.youtube.com/channel/${channel.id}`,
      uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads,
      thumbnail: channel.snippet.thumbnails?.high?.url || channel.snippet.thumbnails?.default?.url,
      country: channel.snippet.country,
      officialName: channel.snippet.title,
      status: 'verified',
    };
  }
  return null;
}

// ── Fallback InnerTube Search (Scraping - 0 Quota) ──────────────────────────
async function resolveByName(name: string): Promise<ResolvedChannel> {
  // Para evitar usar search.list (que cuesta 100 puntos) dentro de la Edge Function,
  // usamos InnerTube como fallback si no hay channelId ni handle.
  // Nota: En el futuro, si QuotaBrain autoriza, se puede llamar a search.list.
  try {
    const searchResponse = await fetch('https://www.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20240101', hl: 'es', gl: 'AR' } },
        query: name,
        params: 'EgIQAg==', // filter: channels only
      }),
    });

    if (!searchResponse.ok) return { name, status: 'not_found' };

    const data = await searchResponse.json();
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

    for (const item of contents.slice(0, 5)) {
      const channel = item?.channelRenderer;
      if (!channel) continue;
      const channelId = channel.channelId;
      if (channelId) {
        // Resolvemos el detalle final con API Oficial usando el ID encontrado (cuesta 1 punto en vez de 100)
        const finalChannel = await fetchChannelFromApi(channelId, 'id');
        if (finalChannel) {
          return { ...finalChannel, resolutionMethod: 'name_search_fallback' };
        }
      }
    }
    return { name, status: 'not_found' };
  } catch (err) {
    return { name, status: 'not_found', error: String(err) };
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, channels, category = 'movies_series', limit = 25 } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (action === 'resolve_batch') {
      const inputs: ResolveInput[] = channels || [];
      const results: ResolvedChannel[] = [];

      for (const input of inputs) {
        let resolved: ResolvedChannel | null = null;
        let method = '';

        // 1. Prioridad: Channel ID (1 unidad de cuota)
        if (input.provider_channel_id) {
          resolved = await fetchChannelFromApi(input.provider_channel_id, 'id');
          if (resolved) method = 'channel_id';
        }
        
        // 2. Prioridad: Handle (1 unidad de cuota)
        if (!resolved && input.handle) {
          const handleStr = input.handle.startsWith('@') ? input.handle : `@${input.handle}`;
          resolved = await fetchChannelFromApi(handleStr, 'forHandle');
          if (resolved) method = 'handle';
        }

        // 3. Fallback: Name (Usa InnerTube para buscar, luego fetchChannelFromApi con el ID - Total: 1 unidad)
        if (!resolved) {
          resolved = await resolveByName(input.name);
          if (resolved.status === 'verified') method = resolved.resolutionMethod || 'name';
        }

        if (resolved && resolved.status === 'verified' && resolved.channelId) {
          resolved.resolutionMethod = method;
          results.push(resolved);

          await supabase.from('seed_sources').upsert({
            name: input.name,
            provider: 'youtube',
            provider_channel_id: resolved.channelId,
            handle: resolved.handle,
            canonical_url: resolved.canonicalUrl,
            uploads_playlist_id: resolved.uploadsPlaylistId,
            thumbnail: resolved.thumbnail,
            country: resolved.country,
            official_name: resolved.officialName,
            category,
            tier: input.tier || 'B',
            status: 'verified',
            resolution_method: method,
            verified_at: new Date().toISOString(),
          }, { onConflict: 'provider_channel_id' });
        } else {
          results.push({ name: input.name, status: 'not_found' });
        }
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'action no reconocida' }), { status: 400, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
