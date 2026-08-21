import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Manejo de CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    const q = (query || "").trim();

    if (!q) {
      return new Response(
        JSON.stringify({ success: false, error: "Query is required", videos: [], channels: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Consulta interna a YouTube InnerTube desde el servidor (0 CORS, 0 Cuotas)
    const ytRes = await fetch("https://www.youtube.com/youtubei/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20240101.01.00",
            hl: "es",
            gl: "AR",
          },
        },
        query: q,
      }),
    });

    if (!ytRes.ok) {
      throw new Error(`YouTube responded with status ${ytRes.status}`);
    }

    const data = await ytRes.json();
    const { videos, channels } = extractRenderers(data);

    return new Response(
      JSON.stringify({
        success: true,
        query: q,
        videos,
        channels,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || "Failed to search YouTube",
        videos: [],
        channels: [],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function extractRenderers(ytData: any) {
  const videos: any[] = [];
  const channels: any[] = [];

  function traverse(node: any) {
    if (!node || typeof node !== "object") return;

    // Video Renderer
    if (node.videoRenderer) {
      const vr = node.videoRenderer;
      const vidId = vr.videoId;
      if (vidId) {
        const title = vr.title?.runs?.map((r: any) => r.text).join("") || vr.title?.simpleText || "Video de YouTube";
        const channelTitle = vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || "Canal";
        const channelId = vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || vr.channelId || "";
        const channelAvatar = vr.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;

        const isLive = Boolean(
          vr.badges?.some((b: any) => {
            const label = b.metadataBadgeRenderer?.label?.toLowerCase() || "";
            return label.includes("live") || label.includes("vivo") || label.includes("directo");
          }) || vr.thumbnailOverlays?.some((o: any) => o.thumbnailOverlayTimeStatusRenderer?.style === "LIVE")
        );

        const durationText = isLive
          ? "🔴 EN VIVO"
          : vr.lengthText?.simpleText ||
            vr.lengthText?.runs?.map((r: any) => r.text).join("") ||
            vr.thumbnailOverlays?.find((o: any) => o.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText ||
            "";

        const viewsText = vr.viewCountText?.simpleText || vr.shortViewCountText?.simpleText || vr.shortViewCountText?.runs?.map((r: any) => r.text).join("") || "";
        const publishedText = vr.publishedTimeText?.simpleText || "";
        const description = vr.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r: any) => r.text).join("") || vr.descriptionSnippet?.runs?.map((r: any) => r.text).join("") || "";

        const thumbs = vr.thumbnail?.thumbnails || [];
        const thumbUrl = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`;

        const isVerified = Boolean(
          vr.ownerBadges?.some(
            (b: any) =>
              b.metadataBadgeRenderer?.style?.includes("VERIFIED") ||
              b.metadataBadgeRenderer?.tooltip?.toLowerCase().includes("verificado")
          )
        );

        videos.push({
          id: vidId,
          type: "video",
          title,
          description,
          thumbnail: thumbUrl.startsWith("//") ? `https:${thumbUrl}` : thumbUrl,
          videoUrl: `https://www.youtube.com/embed/${vidId}`,
          channelTitle,
          channelId,
          channelAvatar,
          durationText,
          viewsText,
          publishedText,
          isLive,
          isVerified,
        });
      }
    }

    // Channel Renderer
    if (node.channelRenderer) {
      const cr = node.channelRenderer;
      const cid = cr.channelId;
      if (cid) {
        const name = cr.title?.simpleText || cr.title?.runs?.map((r: any) => r.text).join("") || "Canal";
        const handle = cr.subscriberCountText?.simpleText?.startsWith("@")
          ? cr.subscriberCountText.simpleText
          : `@${name.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "")}`;
        const subscribersText = cr.videoCountText?.simpleText || cr.subscriberCountText?.simpleText || "Canal Oficial";
        const description = cr.descriptionSnippet?.runs?.map((r: any) => r.text).join("") || "";
        const thumbs = cr.thumbnail?.thumbnails || [];
        const avatarUrl = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=151329&color=00f0ff`;

        const isVerified = Boolean(
          cr.ownerBadges?.some(
            (b: any) =>
              b.metadataBadgeRenderer?.style?.includes("VERIFIED") ||
              b.metadataBadgeRenderer?.tooltip?.toLowerCase().includes("verificado")
          )
        );

        channels.push({
          id: cid,
          type: "channel",
          title: name,
          description,
          thumbnail: avatarUrl.startsWith("//") ? `https:${avatarUrl}` : avatarUrl,
          videoUrl: `https://www.youtube.com/embed/videoseries?list=UU${cid.replace(/^UC/, "")}`,
          channelTitle: name,
          channelId: cid,
          channelAvatar: avatarUrl.startsWith("//") ? `https:${avatarUrl}` : avatarUrl,
          subscribersText,
          handle,
          isLive: false,
          isVerified,
        });
      }
    }

    for (const key of Object.keys(node)) {
      if (Array.isArray(node[key])) {
        node[key].forEach(traverse);
      } else if (node[key] && typeof node[key] === "object") {
        traverse(node[key]);
      }
    }
  }

  traverse(ytData);
  return { videos, channels };
}
