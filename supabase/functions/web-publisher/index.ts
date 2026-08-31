import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple XML extraction
function getTagContent(xml: string, tag: string): string {
  const start = xml.indexOf(`<${tag}>`);
  if (start === -1) {
    const startWithAttr = xml.indexOf(`<${tag} `);
    if (startWithAttr === -1) return '';
    const endAttr = xml.indexOf('>', startWithAttr);
    if (endAttr === -1) return '';
    const end = xml.indexOf(`</${tag}>`, endAttr);
    if (end === -1) return '';
    return xml.substring(endAttr + 1, end).trim();
  }
  const end = xml.indexOf(`</${tag}>`, start);
  if (end === -1) return '';
  return xml.substring(start + tag.length + 2, end).trim();
}

function extractItems(xml: string): string[] {
  const items: string[] = [];
  let currentIndex = 0;
  while (true) {
    const start = xml.indexOf('<item>', currentIndex);
    if (start === -1) break;
    const end = xml.indexOf('</item>', start);
    if (end === -1) break;
    items.push(xml.substring(start, end + 7));
    currentIndex = end + 7;
  }
  return items;
}

export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const { query, limit = 10 } = await req.json();

      if (!query) {
        throw new Error("Missing 'query' parameter");
      }

      // Fetch from Google News RSS
      const encodedQuery = encodeURIComponent(query);
      const url = `https://news.google.com/rss/search?q=${encodedQuery}&hl=es-419&gl=AR&ceid=AR:es-419`;
      
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Google News RSS failed: ${res.statusText}`);
      }

      const xml = await res.text();
      const itemBlocks = extractItems(xml).slice(0, limit);

      const items = itemBlocks.map((block, idx) => {
        let title = getTagContent(block, 'title');
        let link = getTagContent(block, 'link');
        let pubDate = getTagContent(block, 'pubDate');
        let sourceName = getTagContent(block, 'source');
        
        // Handle CDATA or URL escapes
        title = title.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        
        return {
          id: `news_${idx}_${Date.now()}`,
          type: 'article',
          title: title,
          description: '', 
          provider: 'publisher',
          videoUrl: link,
          thumbnail: undefined, 
          channelTitle: sourceName || 'Google News',
          channelId: 'news_source',
          publishedText: pubDate,
          isLive: false,
          isVerified: true,
          durationSeconds: 0,
          viewCount: 0,
          retrievalSource: 'publisher'
        };
      });

      return new Response(JSON.stringify({ success: true, items }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
