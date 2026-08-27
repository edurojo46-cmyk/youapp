import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default {
  fetch: async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    try {
      const { provider, query, limit = 20 } = await req.json();

      if (!query) {
        return new Response(JSON.stringify({ error: 'Query is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let results: any[] = [];

      if (provider === 'youtube') {
        const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY');
        if (!YOUTUBE_API_KEY) {
            console.warn('YOUTUBE_API_KEY is not configured in Edge Function environment variables. Returning empty results or you could add a mock fallback here if needed, but per specs we should throw.');
            throw new Error('YOUTUBE_API_KEY is not configured');
        }

        const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&maxResults=${limit}&type=video&key=${YOUTUBE_API_KEY}`);
        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`YouTube API returned ${res.status}: ${errBody}`);
        }
        
        const data = await res.json();
        
        results = data.items.map((item: any) => ({
          id: item.id.videoId,
          type: 'video',
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
          videoUrl: `https://www.youtube.com/embed/${item.id.videoId}`,
          channelTitle: item.snippet.channelTitle,
          channelId: item.snippet.channelId,
          publishedText: item.snippet.publishedAt,
          isLive: item.snippet.liveBroadcastContent === 'live',
          isVerified: false,
          provider: 'youtube',
          source: {
            provider: 'youtube',
            discoveryMethod: 'youtube-api',
            discoveredAt: new Date().toISOString()
          }
        }));
      } else {
         return new Response(JSON.stringify({ error: `Provider ${provider} not implemented yet` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
