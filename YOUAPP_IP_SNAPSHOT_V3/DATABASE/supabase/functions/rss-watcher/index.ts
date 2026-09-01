import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RssEntry {
  videoId: string;
  title: string;
  published: string;
  updated: string;
  thumbnail: string;
  description: string;
}

// ── Simple & robust XML Parser for YouTube RSS ────────────────────────────────
function parseYoutubeRss(xmlText: string): RssEntry[] {
  const entries: RssEntry[] = [];
  const entryBlocks = xmlText.split('<entry>');
  
  for (let i = 1; i < entryBlocks.length; i++) {
    const block = entryBlocks[i].split('</entry>')[0];
    
    const videoIdMatch = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || block.match(/<id>yt:video:([^<]+)<\/id>/);
    const titleMatch = block.match(/<title>([^<]+)<\/title>/) || block.match(/<media:title>([^<]+)<\/media:title>/);
    const pubMatch = block.match(/<published>([^<]+)<\/published>/);
    const updatedMatch = block.match(/<updated>([^<]+)<\/updated>/);
    const thumbMatch = block.match(/<media:thumbnail[^>]+url="([^"]+)"/);
    const descMatch = block.match(/<media:description>([\s\S]*?)<\/media:description>/);

    if (videoIdMatch && videoIdMatch[1]) {
      entries.push({
        videoId: videoIdMatch[1].trim(),
        title: titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : '',
        published: pubMatch ? pubMatch[1].trim() : new Date().toISOString(),
        updated: updatedMatch ? updatedMatch[1].trim() : new Date().toISOString(),
        thumbnail: thumbMatch ? thumbMatch[1] : `https://i.ytimg.com/vi/${videoIdMatch[1]}/hqdefault.jpg`,
        description: descMatch ? decodeXmlEntities(descMatch[1].trim()) : '',
      });
    }
  }
  return entries;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function calculateNextCheckHours(avgIntervalHours: number): number {
  if (avgIntervalHours <= 4) return 2;
  if (avgIntervalHours <= 12) return 4;
  if (avgIntervalHours <= 48) return 12;
  return 24;
}

export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const body = await req.json().catch(() => ({}));
      const { action = 'tick', limit = 20, forceAll = false, channelId: singleChannelId } = body;

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const apiKey = Deno.env.get('YOUTUBE_API_KEY') || '';
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // ── Select channels to check ──
      let query = supabase
        .from('seed_sources')
        .select('*')
        .eq('provider', 'youtube')
        .eq('status', 'verified');

      if (singleChannelId) {
        query = query.eq('provider_channel_id', singleChannelId);
      } else if (!forceAll) {
        // Pick channels due for check or never checked
        query = query.or(`next_check_at.lte.${new Date().toISOString()},next_check_at.is.null`).limit(limit);
      } else {
        query = query.limit(limit);
      }

      const { data: channels, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      const results = {
        channelsChecked: 0,
        newVideosFound: 0,
        videosEnriched: 0,
        errors: [] as string[],
        quotaUsed: 0,
        details: [] as any[]
      };

      if (!channels || channels.length === 0) {
        return new Response(JSON.stringify({ message: 'No channels due for RSS check', results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const newVideoIdsToEnrich: { videoId: string; channelId: string; category: string }[] = [];

      for (const channel of channels) {
        results.channelsChecked++;
        const targetChannelId = channel.provider_channel_id;
        const rssUrl = channel.rss_url || `https://www.youtube.com/feeds/videos.xml?channel_id=${targetChannelId}`;

        try {
          const rssRes = await fetch(rssUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/xml, text/xml, */*'
            },
            signal: AbortSignal.timeout(10000)
          });

          if (!rssRes.ok) {
            throw new Error(`HTTP ${rssRes.status} fetching RSS`);
          }

          const xmlText = await rssRes.text();
          const entries = parseYoutubeRss(xmlText);

          let channelNewCount = 0;
          let latestPublishDate: Date | null = channel.last_publish_at ? new Date(channel.last_publish_at) : null;

          for (const entry of entries) {
            const pubDate = new Date(entry.published);
            if (!latestPublishDate || pubDate > latestPublishDate) {
              latestPublishDate = pubDate;
            }

            // Check if video exists in catalog or staging
            const { data: existingIndex } = await supabase
              .from('youapp_index')
              .select('id')
              .eq('provider_video_id', entry.videoId)
              .maybeSingle();

            if (!existingIndex) {
              // Add to staging catalog_import_items or directly to queue
              const { error: insertItemErr } = await supabase
                .from('catalog_import_items')
                .upsert({
                  job_id: null,
                  video_id: entry.videoId,
                  title: entry.title,
                  thumbnail: entry.thumbnail,
                  status: 'approved',
                  quality_score: 80,
                  raw_data: {
                    rss: true,
                    published: entry.published,
                    description: entry.description,
                    channelId: targetChannelId,
                    channelName: channel.name,
                    category: channel.category || 'movies_series'
                  }
                }, { onConflict: 'video_id' });

              if (!insertItemErr) {
                channelNewCount++;
                results.newVideosFound++;
                newVideoIdsToEnrich.push({
                  videoId: entry.videoId,
                  channelId: targetChannelId,
                  category: channel.category || 'movies_series'
                });
              }
            }
          }

          // Calculate adaptive publish interval
          let avgIntervalHours = channel.avg_publish_interval_hours || 24;
          if (latestPublishDate && channel.last_publish_at && channelNewCount > 0) {
            const hoursDiff = (latestPublishDate.getTime() - new Date(channel.last_publish_at).getTime()) / (1000 * 3600);
            if (hoursDiff > 0) {
              avgIntervalHours = Math.round((avgIntervalHours * 0.7 + (hoursDiff / channelNewCount) * 0.3) * 10) / 10;
            }
          }

          const nextCheckInterval = calculateNextCheckHours(avgIntervalHours);
          const nextCheckAt = new Date(Date.now() + nextCheckInterval * 3600 * 1000).toISOString();

          await supabase
            .from('seed_sources')
            .update({
              rss_url: rssUrl,
              last_checked_at: new Date().toISOString(),
              last_publish_at: latestPublishDate ? latestPublishDate.toISOString() : channel.last_publish_at,
              avg_publish_interval_hours: avgIntervalHours,
              next_check_at: nextCheckAt,
              rss_fail_count: 0
            })
            .eq('id', channel.id);

          results.details.push({
            channel: channel.name,
            newVideos: channelNewCount,
            totalRssFound: entries.length,
            nextCheckInHours: nextCheckInterval
          });

        } catch (err: any) {
          const failCount = (channel.rss_fail_count || 0) + 1;
          const retryHours = Math.min(24, failCount * 2);
          const nextCheckAt = new Date(Date.now() + retryHours * 3600 * 1000).toISOString();

          await supabase
            .from('seed_sources')
            .update({
              last_checked_at: new Date().toISOString(),
              rss_fail_count: failCount,
              next_check_at: nextCheckAt
            })
            .eq('id', channel.id);

          results.errors.push(`Channel ${channel.name} RSS error: ${err.message}`);
        }
      }

      // ── Enrich new videos with videos.list (API oficial, Batch de 50) ──
      // Cost: 1 quota unit total per 50 videos (NOT search.list!)
      if (apiKey && newVideoIdsToEnrich.length > 0) {
        const batchIds = newVideoIdsToEnrich.slice(0, 50).map(v => v.videoId).join(',');
        try {
          const vRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${batchIds}&key=${apiKey}`);
          if (vRes.ok) {
            const vData = await vRes.json();
            results.quotaUsed += 1;

            if (vData.items) {
              const atlasEnrichQueue: string[] = [];

              for (const item of vData.items) {
                const itemMeta = newVideoIdsToEnrich.find(v => v.videoId === item.id);
                const category = itemMeta ? itemMeta.category : 'movies_series';

                // Upsert con schema universal NormalizedVideo
                const { data: inserted } = await supabase.from('youapp_index').upsert({
                  provider: 'youtube',
                  provider_content_id: item.id,
                  title: item.snippet.title,
                  description: item.snippet.description,
                  thumbnail_url: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
                  canonical_url: `https://www.youtube.com/watch?v=${item.id}`,
                  embed_url: `https://www.youtube.com/embed/${item.id}`,
                  creator_id: item.snippet.channelId,
                  creator_name: item.snippet.channelTitle,
                  published_at: item.snippet.publishedAt,
                  published_at_precision: 'exact',
                  content_state: 'vod',
                  embeddable: item.status?.embeddable !== false,
                  category,
                  views: parseInt(item.statistics?.viewCount || '0', 10),
                  likes: parseInt(item.statistics?.likeCount || '0', 10),
                  duration_seconds: parseIsoDuration(item.contentDetails?.duration || ''),
                  source: 'watcher_rss',
                  source_verified: true,
                  metadata_provenance: 'official_api',
                }, { onConflict: 'provider,provider_content_id' }).select('id').single();

                if (inserted?.id) {
                  atlasEnrichQueue.push(inserted.id);
                }

                results.videosEnriched++;
              }

              // Llamar a atlas-enricher en batch para clasificar los videos nuevos
              if (atlasEnrichQueue.length > 0) {
                try {
                  await supabase.functions.invoke('atlas-enricher', {
                    body: { batch_ids: atlasEnrichQueue }
                  });
                } catch (enrichErr: any) {
                  results.errors.push(`Atlas enricher error: ${enrichErr.message}`);
                }
              }
            }
          }
        } catch (e: any) {
          results.errors.push(`Video enrichment error: ${e.message}`);
        }
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
};

function parseIsoDuration(isoDuration: string): number {
  if (!isoDuration) return 0;
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}
