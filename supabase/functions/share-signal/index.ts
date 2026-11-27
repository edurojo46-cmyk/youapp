// Supabase Edge Function: share-signal
// Sirve metadatos Open Graph dinámicos (miniatura + título reales) para WhatsApp, Telegram, X y Facebook
// al compartir cualquier señal, video o canción de YOUAPP, y redirige al instante a youapptv.com.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEFAULT_APP_ORIGIN = 'https://youapptv.com';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeOrigin(raw: string | null): string {
  const fallback = Deno.env.get('PUBLIC_APP_URL') || DEFAULT_APP_ORIGIN;
  if (!raw) return fallback.replace(/\/+$/, '');
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.origin;
    }
  } catch {
    // ignore invalid origin
  }
  return fallback.replace(/\/+$/, '');
}

function sanitizeTargetUrl(raw: string | null, fallbackOrigin: string): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'youapptv.com' ||
        parsed.hostname === 'www.youapptv.com' ||
        parsed.hostname === 'youapp.tv')
    ) {
      return parsed.toString();
    }
  } catch {
    // ignore
  }
  if (raw.startsWith('/')) {
    return `${fallbackOrigin}${raw}`;
  }
  return null;
}

function sanitizeImageUrl(raw: string | null, ytId: string | null, fallbackOrigin: string): string {
  if (raw && /^https?:\/\//i.test(raw.trim())) {
    try {
      const parsed = new URL(raw.trim());
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.toString();
      }
    } catch {
      // ignore
    }
  }
  if (ytId && /^[A-Za-z0-9_-]{11}$/.test(ytId)) {
    return `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
  }
  return `${fallbackOrigin}/home-tech-hud-bg.jpg`;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const signalId = (url.searchParams.get('signal') || '').trim();
  const appOrigin = sanitizeOrigin(url.searchParams.get('app'));
  const explicitTarget = sanitizeTargetUrl(url.searchParams.get('to'), appOrigin);
  const explicitTitle = (url.searchParams.get('t') || '').trim().slice(0, 140);
  const explicitDesc = (url.searchParams.get('d') || '').trim().slice(0, 220);
  const explicitImg = (url.searchParams.get('img') || '').trim();
  const explicitYtId = (url.searchParams.get('v') || '').trim();

  const targetUrl =
    explicitTarget ||
    (signalId
      ? `${appOrigin}/misenal1?signal=${encodeURIComponent(signalId)}&sharedSignal=1`
      : `${appOrigin}/search`);

  let title = explicitTitle || 'YOUAPP TV · Mi Señal';
  let description =
    explicitDesc ||
    'Mirá este video y armá tu propia señal de TV en YOUAPP. Todo lo que te gusta, organizado por vos.';
  let image = sanitizeImageUrl(explicitImg, explicitYtId, appOrigin);

  // Si se compartió una señal por ID y faltan datos explícitos, enriquecer desde Supabase
  if (signalId && (!explicitTitle || !explicitImg)) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseKey =
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';

      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: sig } = await supabase
          .from('custom_signals')
          .select('id, name, prompt')
          .eq('client_signal_id', signalId)
          .maybeSingle();

        if (sig) {
          if (!explicitTitle) {
            title = `${sig.name || 'Mi Señal'} · YOUAPP TV`;
          }
          const { data: items, count } = await supabase
            .from('signal_schedule_items')
            .select('title, thumbnail_url, provider_content_id', { count: 'exact' })
            .eq('signal_id', sig.id)
            .order('position', { ascending: true })
            .limit(3);

          const totalCount = typeof count === 'number' ? count : items?.length || 0;
          if (!explicitDesc) {
            const promptPart = sig.prompt ? `${String(sig.prompt).trim().slice(0, 110)} · ` : '';
            description =
              totalCount > 0
                ? `${promptPart}${totalCount} videos seleccionados. Abrí y seguí esta señal gratis en YOUAPP TV.`
                : `${promptPart}Abrí y seguí esta señal gratis en YOUAPP TV.`;
          }

          if (!explicitImg && !explicitYtId) {
            const first = items?.[0];
            if (first?.thumbnail_url && /^https?:\/\//.test(first.thumbnail_url)) {
              image = first.thumbnail_url;
            } else if (
              first?.provider_content_id &&
              /^[A-Za-z0-9_-]{11}$/.test(first.provider_content_id)
            ) {
              image = `https://i.ytimg.com/vi/${first.provider_content_id}/hqdefault.jpg`;
            }
          }
        }
      }
    } catch {
      // fallback to explicit/default OG card
    }
  }

  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeImg = escapeHtml(image);
  const safeTarget = escapeHtml(targetUrl);
  const safeCanonical = escapeHtml(req.url);

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
      <p style="letter-spacing:0.14em;font-size:12px;opacity:0.7;text-transform:uppercase;">YOUAPP TV</p>
      <h1 style="font-size:20px;margin:8px 0 12px;">${safeTitle}</h1>
      <p style="max-width:420px;opacity:0.8;font-size:14px;line-height:1.5;">${safeDesc}</p>
      <a href="${safeTarget}" style="display:inline-block;margin-top:18px;padding:10px 20px;border-radius:999px;background:#ffffff;color:#0f172a;font-weight:700;text-decoration:none;">Abrir en YOUAPP TV</a>
    </div>
    <script>window.location.replace(${JSON.stringify(targetUrl)});</script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=180'
    }
  });
});
