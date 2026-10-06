import http from 'http';
import https from 'https';
import { URL } from 'url';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function normalizeEmail(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let clean = raw.trim().toLowerCase().replace(/^[<"'(]+|[>"'),;.:]+$/g, '').trim();
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(clean)) return null;
  const parts = clean.split('@');
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return null;
  if (clean.endsWith('.png') || clean.endsWith('.jpg') || clean.endsWith('.jpeg') || clean.endsWith('.gif') || clean.endsWith('.webp')) return null;
  if (local.length > 64 || clean.length > 254) return null;
  return clean;
}

export function extractEmails(text) {
  if (!text) return [];
  const matches = text.match(EMAIL_REGEX) || [];
  const valid = [];
  for (const m of matches) {
    const norm = normalizeEmail(m);
    if (norm) valid.push(norm);
  }
  return Array.from(new Set(valid));
}

export function extractChildLinks(html, baseUrl, maxLinks = 3) {
  if (!html || typeof html !== 'string') return [];
  const links = new Set();
  const linkRegex = /href=["']([^"']+)["']/gi;
  let match;
  let parsedBase;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    return [];
  }

  const baseDomain = parsedBase.hostname.replace(/^www\./, '');
  const priorityPatterns = [
    /contacto/i,
    /contact/i,
    /autoridades/i,
    /institucional/i,
    /directorio/i,
    /personal/i,
    /equipo/i,
    /sedes/i,
    /departamentos/i,
    /facultades/i,
    /juzgados/i,
    /matriculados/i,
    /secretarias/i
  ];

  const foundLinks = [];

  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:')) continue;
    try {
      const resolved = new URL(rawHref, baseUrl);
      // Only same host or subdomain of baseDomain
      if (resolved.hostname === parsedBase.hostname || resolved.hostname.endsWith('.' + baseDomain)) {
        const fullUrl = resolved.toString();
        if (fullUrl === baseUrl) continue;
        const pathname = resolved.pathname.toLowerCase();
        // Ignore static assets
        if (/\.(css|js|png|jpe?g|gif|svg|ico|woff2?|ttf|eot|pdf|zip|gz|xml|rss|json)$/i.test(pathname)) continue;

        let priority = 0;
        for (const p of priorityPatterns) {
          if (p.test(pathname) || p.test(resolved.search)) {
            priority += 10;
            break;
          }
        }
        if (priority > 0 && !links.has(fullUrl)) {
          links.add(fullUrl);
          foundLinks.push({ url: fullUrl, priority });
        }
      }
    } catch {
      // ignore invalid URL
    }
  }

  foundLinks.sort((a, b) => b.priority - a.priority);
  return foundLinks.slice(0, maxLinks).map(l => l.url);
}

export async function boundedFetch(targetUrl, maxBytes = 524288, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      return resolve({ ok: false, status: 0, error: 'INVALID_URL', bytes: 0, text: '' });
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(targetUrl, {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (Atlas Research Probe/2.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain,text/csv;q=0.8,*/*;q=0.5',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8'
      },
      rejectUnauthorized: false
    }, (res) => {
      // Follow redirect (1 hop)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        req.destroy();
        try {
          const redirectUrl = new URL(res.headers.location, targetUrl).toString();
          return resolve(boundedFetch(redirectUrl, maxBytes, timeoutMs));
        } catch {
          return resolve({ ok: false, status: res.statusCode, error: 'BAD_REDIRECT', bytes: 0, text: '' });
        }
      }

      let totalBytes = 0;
      const chunks = [];

      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        chunks.push(chunk);
        if (totalBytes >= maxBytes) {
          req.destroy(); // Abort reading beyond max bytes
        }
      });

      res.on('end', () => {
        const fullBuf = Buffer.concat(chunks);
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          bytes: fullBuf.length,
          text: fullBuf.toString('utf8', 0, Math.min(fullBuf.length, maxBytes))
        });
      });

      res.on('close', () => {
        const fullBuf = Buffer.concat(chunks);
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          bytes: fullBuf.length,
          text: fullBuf.toString('utf8', 0, Math.min(fullBuf.length, maxBytes))
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: 'TIMEOUT', bytes: 0, text: '' });
    });

    req.on('error', (err) => {
      resolve({ ok: false, status: 0, error: err.code || err.message, bytes: 0, text: '' });
    });
  });
}
