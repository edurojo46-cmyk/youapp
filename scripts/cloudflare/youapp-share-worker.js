// Cloudflare Worker: youapp-share (Plan Free · 100.000 req/día · US$ 0)
// Devuelve HTML real con og:image y og:title exactos de cada video/señal para WhatsApp, Telegram y X,
// y redirige al instante a visitantes humanos hacia https://youapptv.com/...

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

export default {
  async fetch(request) {
    const reqUrl = new URL(request.url);
    const targetUrl = sanitizeTarget(reqUrl.searchParams.get('to'));
    const title = (reqUrl.searchParams.get('t') || 'YOUAPP TV · Señal en vivo').trim().slice(0, 140);
    const desc = (reqUrl.searchParams.get('d') || 'Mirá este video y armá tu propia señal en YOUAPP TV.').trim().slice(0, 220);
    const ytId = (reqUrl.searchParams.get('v') || '').trim();
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
        'cache-control': 'public, max-age=300'
      }
    });
  }
};
