// Cloudflare Worker: youapp-share (Plan Free · 100.000 req/día · US$ 0)
// Soporta enlaces ultra-cortos:
//   /v/<ytId> -> Buscar en YOUAPP TV
//   /m/<ytId> -> MiTV / Mi Señal en YOUAPP TV
//   /y/<ytId> -> YouMusic en YOUAPP TV
// + compatibilidad con ?to=...&t=...&d=...&v=...&img=...

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeTarget(raw) {
  if (!raw) return 'https://youapptv.com/';
  try {
    const u = new URL(raw);
    if (
      u.protocol === 'https:' &&
      (u.hostname === 'youapptv.com' || u.hostname === 'www.youapptv.com')
    ) {
      return u.toString();
    }
  } catch {}
  return 'https://youapptv.com/';
}

function sanitizeImage(rawImg, ytId) {
  if (rawImg && /^https?:\/\//i.test(rawImg)) {
    try {
      const u = new URL(rawImg);
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString();
    } catch {}
  }
  if (ytId && /^[A-Za-z0-9_-]{11}$/.test(ytId)) {
    return `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
  }
  return 'https://youapptv.com/home-tech-hud-bg.jpg';
}

async function fetchYouTubeOEmbedMeta(ytId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(ytId)}&format=json`,
      { cf: { cacheTtl: 3600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: typeof data?.title === 'string' ? data.title.trim() : '',
      author: typeof data?.author_name === 'string' ? data.author_name.trim() : ''
    };
  } catch {
    return null;
  }
}

export default {
  async fetch(request) {
    const reqUrl = new URL(request.url);
    const shortMatch = reqUrl.pathname.match(/^\/([vmy])\/([A-Za-z0-9_-]{11})\/?$/);

    let targetUrl = sanitizeTarget(reqUrl.searchParams.get('to'));
    let ytId = (reqUrl.searchParams.get('v') || '').trim();
    let title = (reqUrl.searchParams.get('t') || '').trim().slice(0, 140);
    let desc = (reqUrl.searchParams.get('d') || '').trim().slice(0, 220);

    if (shortMatch) {
      const mode = shortMatch[1];
      ytId = shortMatch[2];
      if (mode === 'm') {
        targetUrl = `https://youapptv.com/mitv?add=${encodeURIComponent(`https://www.youtube.com/watch?v=${ytId}`)}`;
      } else if (mode === 'y') {
        targetUrl = `https://youapptv.com/youmusic?v=${encodeURIComponent(ytId)}`;
      } else {
        targetUrl = `https://youapptv.com/search?v=${encodeURIComponent(ytId)}`;
      }
      if (!title) {
        const meta = await fetchYouTubeOEmbedMeta(ytId);
        if (meta?.title) {
          title = `${meta.title.slice(0, 110)} · YOUAPP TV`;
          if (!desc) {
            desc = meta.author
              ? `${meta.author} · Miralo en YOUAPP TV`
              : 'Miralo gratis en YOUAPP TV';
          }
        }
      }
    }

    if (!title) title = 'YOUAPP TV · Señal en vivo';
    if (!desc) desc = 'Mirá este video y armá tu propia señal en YOUAPP TV.';
    const imgUrl = sanitizeImage((reqUrl.searchParams.get('img') || '').trim(), ytId);

    const safeTitle = escapeHtml(title);
    const safeDesc = escapeHtml(desc);
    const safeImg = escapeHtml(imgUrl);
    const safeTarget = escapeHtml(targetUrl);
    const safeCanonical = escapeHtml(request.url);

    const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDesc}" />
    <meta property="og:site_name" content="YOUAPP TV" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:image" content="${safeImg}" />
    <meta property="og:image:secure_url" content="${safeImg}" />
    <meta property="og:image:width" content="480" />
    <meta property="og:image:height" content="360" />
    <meta property="og:url" content="${safeCanonical}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDesc}" />
    <meta name="twitter:image" content="${safeImg}" />
    <meta http-equiv="refresh" content="0;url=${safeTarget}" />
  </head>
  <body style="margin:0;background:#0b0d12;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px;">
    <div>
      <p style="letter-spacing:0.14em;font-size:12px;opacity:0.7;">YOUAPP TV</p>
      <h1 style="font-size:20px;margin:8px 0 12px;">${safeTitle}</h1>
      <p style="max-width:420px;opacity:0.8;font-size:14px;">${safeDesc}</p>
      <a href="${safeTarget}" style="display:inline-block;margin-top:18px;padding:10px 20px;border-radius:999px;background:#ffffff;color:#0f172a;font-weight:700;text-decoration:none;">Abrir en YOUAPP TV</a>
    </div>
    <script>window.location.replace(${JSON.stringify(targetUrl)});</script>
  </body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=600'
      }
    });
  }
};
