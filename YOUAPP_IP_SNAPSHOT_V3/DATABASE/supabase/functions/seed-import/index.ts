import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const body = await req.json();
      const { action, type, url, category, limit = 50, excludeShorts = true, minQuality = 55 } = body;
      
      const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY');
      if (!YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY missing');

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // --- HELPER: Resolver Canal a ID ---
      async function resolveChannel(inputUrl: string) {
        // Simple extraction for MVP
        let channelId = '';
        if (inputUrl.includes('/channel/')) {
          channelId = inputUrl.split('/channel/')[1].split('/')[0];
        } else if (inputUrl.includes('/@')) {
          const handle = inputUrl.split('/@')[1].split('/')[0];
          // Use search.list just ONCE to resolve the handle (cheapest way without web scraping)
          const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent('@' + handle)}&key=${YOUTUBE_API_KEY}`);
          const searchData = await searchRes.json();
          if (searchData.items && searchData.items.length > 0) {
            channelId = searchData.items[0].id.channelId;
          }
        }
        if (!channelId) throw new Error("Could not resolve channel ID from URL.");

        // Get Channel Details and Uploads Playlist
        const chRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&id=${channelId}&key=${YOUTUBE_API_KEY}`);
        const chData = await chRes.json();
        if (!chData.items || chData.items.length === 0) throw new Error("Channel not found");
        
        const channel = chData.items[0];
        return {
          channelId: channel.id,
          name: channel.snippet.title,
          thumbnail: channel.snippet.thumbnails?.high?.url,
          uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads,
          totalVideos: channel.statistics.videoCount
        };
      }

      // --- ACTION: PREVIEW ---
      if (action === 'preview') {
        if (type === 'channel') {
          const ch = await resolveChannel(url);
          return new Response(JSON.stringify({
            title: ch.name,
            thumbnail: ch.thumbnail,
            itemCount: ch.totalVideos,
            uploadsPlaylistId: ch.uploadsPlaylistId,
            message: `Found channel "${ch.name}" with ${ch.totalVideos} videos.`
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        return new Response(JSON.stringify({ error: 'Preview not fully implemented for this type' }), { status: 400, headers: corsHeaders });
      }

      // --- ACTION: START (Run in background) ---
      if (action === 'start') {
        let uploadsPlaylistId = body.uploadsPlaylistId;
        
        if (type === 'channel' && !uploadsPlaylistId) {
          const ch = await resolveChannel(url);
          uploadsPlaylistId = ch.uploadsPlaylistId;
        }

        // 1. Create Job in Staging
        const { data: job, error: jobError } = await supabase
          .from('catalog_import_jobs')
          .insert({
            type,
            source_url: url,
            category,
            requested_count: limit,
            status: 'processing'
          })
          .select()
          .single();

        if (jobError) throw jobError;

        // 2. Start Background Processing (Deno Edge Functions allow Promises to continue after response if using Edge Runtime context, 
        // but it's safer to just trigger an async worker or respond immediately while doing small batches. 
        // For MVP, we will process synchronously for up to ~10-15 seconds, and then we would need a proper worker for 500+ items.
        // We will process the first page here and mark it completed for MVP.
        
        (async () => {
          try {
            if (type === 'channel' && uploadsPlaylistId) {
              const itemsRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${Math.min(limit, 50)}&key=${YOUTUBE_API_KEY}`);
              const itemsData = await itemsRes.json();
              
              if (itemsData.items) {
                let processed = 0;
                let duplicates = 0;
                let rejected = 0;

                for (const item of itemsData.items) {
                  processed++;
                  const videoId = item.contentDetails.videoId;
                  
                  // Dummy Quality V1 / Rules check (e.g., skip shorts by checking duration, though we don't have duration here without videos.list)
                  // For MVP we just insert.
                  
                  const { error: itemErr } = await supabase
                    .from('catalog_import_items')
                    .insert({
                      job_id: job.id,
                      video_id: videoId,
                      title: item.snippet.title,
                      thumbnail: item.snippet.thumbnails?.high?.url,
                      status: 'pending_approval'
                    });

                  if (itemErr) {
                    if (itemErr.code === '23505') { // unique violation
                      duplicates++;
                    } else {
                      rejected++;
                    }
                  }
                }

                await supabase.from('catalog_import_jobs').update({
                  processed_count: processed,
                  duplicate_count: duplicates,
                  rejected_count: rejected,
                  status: 'completed'
                }).eq('id', job.id);
              }
            }
          } catch (e) {
            console.error("Background job error:", e);
            await supabase.from('catalog_import_jobs').update({ status: 'failed' }).eq('id', job.id);
          }
        })();

        // Return immediately with Job ID so UI can poll
        return new Response(JSON.stringify({ 
          message: 'Import started', 
          jobId: job.id 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: corsHeaders });

    } catch (err: any) {
      console.error(err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
